export default async (req, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'text/plain; charset=utf-8'
  };

  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  if (!process.env.ANTHROPIC_KEY) return new Response(JSON.stringify({ error: 'ANTHROPIC_KEY manquante' }), { status: 500, headers });

  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Body reçu invalide' }), { status: 400, headers });
  }

  if (!payload.max_tokens) payload.max_tokens = 4096;
  if (!payload.model) payload.model = 'claude-sonnet-4-6';
  payload.stream = true;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text();
    return new Response(JSON.stringify({ error: errText }), { status: anthropicRes.status, headers });
  }

  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const evt = JSON.parse(jsonStr);
              if (evt.type === 'content_block_delta' && evt.delta?.text) {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch (e) {}
          }
        }
      }
      controller.close();
    }
  });

  return new Response(stream, { status: 200, headers });
};
