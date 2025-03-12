const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

export async function POST() {
  try {
    if (!HEYGEN_API_KEY) {
      console.error("API key is missing from .env");
      throw new Error("API key is missing from .env");
    }

    console.log("HeyGen API Key available, requesting token...");

    const res = await fetch(
      "https://api.heygen.com/v1/streaming.create_token",
      {
        method: "POST",
        headers: {
          "x-api-key": HEYGEN_API_KEY,
        },
      }
    );

    if (!res.ok) {
      console.error(`HeyGen API error: ${res.status} ${res.statusText}`);
      throw new Error(`HeyGen API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    if (!data || !data.data || !data.data.token) {
      console.error("Invalid response from HeyGen API:", data);
      throw new Error("Invalid response from HeyGen API");
    }

    console.log("Token retrieved successfully");

    return new Response(data.data.token, {
      status: 200,
    });
  } catch (error) {
    console.error("Error retrieving access token:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to retrieve access token",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
