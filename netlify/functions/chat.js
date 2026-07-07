exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Vérifie la clé API dès le départ
  if (!process.env.ANTHROPIC_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_KEY manquante dans les variables Netlify' }) };
  }

  // Parse le body reçu, avec message clair si invalide
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body reçu invalide (pas du JSON)', raw: event.body }) };
  }

  // S'assure que max_tokens est présent (Anthropic le refuse sinon)
  if (!payload.max_tokens) payload.max_tokens = 1024;
  if (!payload.model) payload.model = 'claude-sonnet-4-5';

  // Timeout de sécurité à 20s pour ne jamais rester bloqué
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    return { statusCode: response.status, headers, body: JSON.stringify(data) };
  } catch (err) {
    clearTimeout(timeout);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.name === 'AbortError' ? 'Timeout: Anthropic n\'a pas répondu en 20s' : err.message })
    };
  }
};
