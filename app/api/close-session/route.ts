const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Session ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!HEYGEN_API_KEY) {
      throw new Error("API key is missing from .env");
    }

    // HeyGenのAPIを呼び出してセッションを終了
    const res = await fetch("https://api.heygen.com/v1/streaming.close", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": HEYGEN_API_KEY,
      },
      body: JSON.stringify({
        session_id: sessionId,
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error closing session:", error);

    return new Response(JSON.stringify({ error: "Failed to close session" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
