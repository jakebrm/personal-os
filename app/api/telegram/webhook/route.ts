import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { classifyCapture, type Classification, type CaptureKind, type Urgency } from '@/lib/router/classifyCapture';

// ── Telegram types (minimal) ─────────────────────────────────────────────────

interface TgUser    { id: number; first_name: string; }
interface TgChat    { id: number; }
interface TgVoice   { file_id: string; duration: number; }
interface TgMessage {
  message_id: number;
  from: TgUser;
  chat: TgChat;
  text?: string;
  voice?: TgVoice;
}
interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message: TgMessage;
  data?: string;
}
interface TgUpdate {
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

// ── Display maps ─────────────────────────────────────────────────────────────

const KIND_ICON: Record<CaptureKind, string> = {
  task: '☑', note: '📝', health: '💪', finance: '💰',
  friends: '👤', reading: '📚', habit: '🔄', agenda: '📅',
};
const KIND_LABEL: Record<CaptureKind, string> = {
  task: 'Task', note: 'Note', health: 'Health', finance: 'Finance',
  friends: 'Friends', reading: 'Reading', habit: 'Habit', agenda: 'Agenda',
};
const URGENCY_LABEL: Record<Urgency, string> = {
  today: 'Today', this_week: 'This Week', this_month: 'This Month',
  someday: 'Someday', key: 'Key ⭐',
};

// Compact code for callback_data (must fit in 64 bytes total)
const URGENCY_CODE: Record<Urgency, string> = {
  today: 'T', this_week: 'W', this_month: 'M', someday: 'S', key: 'K',
};
const CODE_URGENCY: Record<string, Urgency> = {
  T: 'today', W: 'this_week', M: 'this_month', S: 'someday', K: 'key',
};

// ── Telegram API helpers ─────────────────────────────────────────────────────

const TG = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function tgPost(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`[tg] ${method} failed:`, await res.text());
  return res.json();
}

function urgencyKeyboard(captureId: string) {
  return {
    inline_keyboard: [
      [
        { text: '🔴 Today',      callback_data: `urg:T:${captureId}` },
        { text: '📅 This Week',  callback_data: `urg:W:${captureId}` },
        { text: '📆 This Month', callback_data: `urg:M:${captureId}` },
      ],
      [
        { text: '🗓 Someday',    callback_data: `urg:S:${captureId}` },
        { text: '⭐ Key',        callback_data: `urg:K:${captureId}` },
      ],
    ],
  };
}

function confirmationText(classification: Classification, preview: string): string {
  const icon    = KIND_ICON[classification.kind];
  const label   = KIND_LABEL[classification.kind];
  const urgency = URGENCY_LABEL[classification.urgency];
  const method  = classification.method === 'regex' ? ' (regex)' : '';
  return [
    `✅ Logged · ${icon} ${label}`,
    '',
    classification.title,
    '',
    `⏱ ${urgency}${method}`,
  ].join('\n');
}

async function sendConfirmation(
  chatId: number,
  classification: Classification,
  captureId: string,
  text: string,
) {
  await tgPost('sendMessage', {
    chat_id: chatId,
    text: confirmationText(classification, text),
    reply_markup: urgencyKeyboard(captureId),
  });
}

async function answerCallback(callbackQueryId: string, text?: string) {
  await tgPost('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

// ── Voice transcription ──────────────────────────────────────────────────────

async function transcribeVoice(fileId: string): Promise<string> {
  // Resolve Telegram file path
  const fileInfo = await fetch(`${TG}/getFile?file_id=${fileId}`).then(r => r.json()) as {
    result: { file_path: string };
  };
  const filePath = fileInfo.result.file_path;

  // Download audio bytes
  const audioRes  = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  const audioBuf  = Buffer.from(await audioRes.arrayBuffer());

  // Transcribe with Whisper
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const file = await toFile(audioBuf, 'voice.oga', { type: 'audio/ogg' });
  const result = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'text',
  });
  return result as unknown as string; // text format returns a plain string
}

// ── Embedding ────────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

// ── Capture pipeline ─────────────────────────────────────────────────────────

async function processCapture(
  chatId: number,
  messageId: number,
  text: string,
  audioFileId?: string,
) {
  // 1 · Classify
  const cls = await classifyCapture(text);

  // 2 · Write raw_capture
  const { data: capRow, error: capErr } = await supabaseAdmin
    .from('raw_captures')
    .insert({
      source: 'telegram',
      content: text,
      metadata: {
        telegram_chat_id:    chatId,
        telegram_message_id: messageId,
        audio_file_id:       audioFileId ?? null,
        kind:    cls.kind,
        urgency: cls.urgency,
        title:   cls.title,
        method:  cls.method,
      },
    })
    .select('id')
    .single();

  if (capErr || !capRow) {
    console.error('[pipeline] raw_captures insert failed:', capErr);
    throw new Error('raw_captures insert failed');
  }
  const captureId: string = capRow.id;

  // 3 · Route to downstream table
  let downstreamTable: string;
  let downstreamId: string;

  if (cls.kind === 'task') {
    const { data: taskRow, error: taskErr } = await supabaseAdmin
      .from('tasks')
      .insert({
        title:       cls.title,
        description: text,
        status:      'pending',
        metadata: {
          urgency:        cls.urgency,
          raw_capture_id: captureId,
          source:         'telegram',
          method:         cls.method,
        },
      })
      .select('id')
      .single();
    if (taskErr || !taskRow) throw new Error('tasks insert failed: ' + taskErr?.message);
    downstreamTable = 'tasks';
    downstreamId    = taskRow.id;
  } else {
    const { data: logRow, error: logErr } = await supabaseAdmin
      .from('daily_logs')
      .insert({
        log_date: new Date().toISOString().split('T')[0],
        content:  text,
        metadata: {
          kind:           cls.kind,
          urgency:        cls.urgency,
          title:          cls.title,
          raw_capture_id: captureId,
          source:         'telegram',
          method:         cls.method,
        },
      })
      .select('id')
      .single();
    if (logErr || !logRow) throw new Error('daily_logs insert failed: ' + logErr?.message);
    downstreamTable = 'daily_logs';
    downstreamId    = logRow.id;
  }

  // 4 · Embed to memory_chunks (best-effort — non-blocking for Telegram response time)
  const embedAndStore = async () => {
    try {
      const vector = await embed(text);
      await supabaseAdmin.from('memory_chunks').insert({
        content:   text,
        embedding: vector,
        metadata: {
          kind:             cls.kind,
          raw_capture_id:   captureId,
          downstream_table: downstreamTable,
          downstream_id:    downstreamId,
        },
      });
    } catch (e) {
      console.error('[pipeline] embedding failed (non-fatal):', e);
    }
  };
  embedAndStore(); // fire-and-forget — Whisper + classification already used our latency budget

  // 5 · Audit log
  await supabaseAdmin.from('audit_log').insert([
    {
      table_name: 'raw_captures',
      record_id:  captureId,
      operation:  'INSERT',
      new_data: {
        source:  'telegram',
        content: text.slice(0, 200),
        kind:    cls.kind,
        urgency: cls.urgency,
        method:  cls.method,
      },
    },
    {
      table_name: downstreamTable,
      record_id:  downstreamId,
      operation:  'INSERT',
      new_data: {
        title:          cls.title,
        kind:           cls.kind,
        raw_capture_id: captureId,
      },
    },
  ]);

  // 6 · Reply with confirmation + urgency keyboard
  await sendConfirmation(chatId, cls, captureId, text);
}

// ── Urgency override (callback_query) ────────────────────────────────────────

async function handleCallbackQuery(cq: TgCallbackQuery) {
  const { id: callbackId, data, message, from } = cq;

  // Guard: only allow the authorised user
  if (String(from.id) !== process.env.TELEGRAM_USER_ID) {
    await answerCallback(callbackId, '⛔ Not authorised');
    return;
  }

  if (!data?.startsWith('urg:')) {
    await answerCallback(callbackId);
    return;
  }

  const [, code, captureId] = data.split(':');
  const newUrgency = CODE_URGENCY[code];
  if (!newUrgency || !captureId) {
    await answerCallback(callbackId, '⚠️ Bad callback data');
    return;
  }

  // Fetch current raw_capture to get downstream refs + classification
  const { data: cap } = await supabaseAdmin
    .from('raw_captures')
    .select('metadata')
    .eq('id', captureId)
    .single();

  if (!cap) {
    await answerCallback(callbackId, '⚠️ Capture not found');
    return;
  }

  const meta = cap.metadata as Record<string, unknown>;

  // Update raw_capture urgency
  await supabaseAdmin
    .from('raw_captures')
    .update({ metadata: { ...meta, urgency: newUrgency } })
    .eq('id', captureId);

  // Update downstream record urgency via memory_chunks lookup
  const { data: chunk } = await supabaseAdmin
    .from('memory_chunks')
    .select('metadata')
    .eq('metadata->>raw_capture_id', captureId)
    .limit(1)
    .maybeSingle();

  if (chunk) {
    const chunkMeta = chunk.metadata as Record<string, unknown>;
    const dTable = chunkMeta.downstream_table as string;
    const dId    = chunkMeta.downstream_id    as string;

    if (dTable && dId) {
      const { data: downstream } = await supabaseAdmin
        .from(dTable)
        .select('metadata')
        .eq('id', dId)
        .single();

      if (downstream) {
        await supabaseAdmin
          .from(dTable)
          .update({ metadata: { ...(downstream.metadata as Record<string, unknown>), urgency: newUrgency } })
          .eq('id', dId);
      }

      // Audit log the override
      await supabaseAdmin.from('audit_log').insert({
        table_name: 'raw_captures',
        record_id:  captureId,
        operation:  'UPDATE',
        old_data:   { urgency: meta.urgency },
        new_data:   { urgency: newUrgency, override: 'telegram_keyboard' },
      });
    }
  }

  // Edit original Telegram message to reflect new urgency
  const updatedText = [
    (message.text ?? '').split('\n').slice(0, 3).join('\n'), // keep header + title
    '',
    `⏱ ${URGENCY_LABEL[newUrgency]} ✓`,
  ].join('\n');

  await tgPost('editMessageText', {
    chat_id:      message.chat.id,
    message_id:   message.message_id,
    text:         updatedText,
    reply_markup: urgencyKeyboard(captureId),
  });

  await answerCallback(callbackId, `Set to ${URGENCY_LABEL[newUrgency]}`);
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Always return 200 to Telegram — non-200s trigger retries
  try {
    // 1 · Verify webhook secret
    const secret = req.headers.get('x-telegram-bot-api-secret-token');
    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const update: TgUpdate = await req.json();

    // 2 · Callback query (urgency override taps)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message) return NextResponse.json({ ok: true });

    // 3 · Verify user ID
    if (String(message.from?.id) !== process.env.TELEGRAM_USER_ID) {
      return NextResponse.json({ ok: true }); // silently ignore unknown users
    }

    let text: string | undefined;
    let audioFileId: string | undefined;

    // 4 · Extract content
    if (message.text) {
      // Ignore bot commands
      if (message.text.startsWith('/')) {
        await tgPost('sendMessage', {
          chat_id: message.chat.id,
          text: '👋 Send me any text or voice message and I\'ll log it to your OS.',
        });
        return NextResponse.json({ ok: true });
      }
      text = message.text;
    } else if (message.voice) {
      audioFileId = message.voice.file_id;
      await tgPost('sendMessage', { chat_id: message.chat.id, text: '🎙 Transcribing…' });
      text = await transcribeVoice(audioFileId);
    } else {
      await tgPost('sendMessage', {
        chat_id: message.chat.id,
        text: '⚠️ Only text and voice messages are supported.',
      });
      return NextResponse.json({ ok: true });
    }

    if (!text?.trim()) {
      await tgPost('sendMessage', { chat_id: message.chat.id, text: '⚠️ Nothing to capture.' });
      return NextResponse.json({ ok: true });
    }

    // 5 · Full capture pipeline
    await processCapture(message.chat.id, message.message_id, text.trim(), audioFileId);

  } catch (err) {
    // Log but never let the error surface as a non-200 to Telegram
    console.error('[webhook] unhandled error:', err);
  }

  return NextResponse.json({ ok: true });
}
