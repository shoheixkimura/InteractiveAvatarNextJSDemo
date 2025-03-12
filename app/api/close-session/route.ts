const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

export async function POST(request: Request) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Session ID is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const apiKey = process.env.HEYGEN_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key is not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    try {
      const response = await fetch(
        `https://api.heygen.com/v1/streaming_avatar.close_session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: JSON.stringify({
            session_id: sessionId,
          }),
        }
      );

      // レスポンスのContent-Typeをチェック
      const contentType = response.headers.get("Content-Type") || "";

      if (contentType.includes("application/json")) {
        // JSONレスポンスの場合は通常通り処理
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
          },
        });
      } else {
        // JSONでない場合はテキストとして処理
        const text = await response.text();
        console.log(
          "Non-JSON response from HeyGen API:",
          text.substring(0, 100) + "..."
        );

        // エラーレスポンスを返す
        return new Response(
          JSON.stringify({
            success: false,
            message: "Session closed with non-JSON response",
            status: response.status,
          }),
          {
            status: 200, // クライアントにはエラーではなく成功を返す
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
    } catch (fetchError) {
      console.error("Error closing session:", fetchError);

      // フェッチエラーでもクライアントには成功を返す
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to close session, but continuing",
          error:
            fetchError instanceof Error ? fetchError.message : "Unknown error",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (error) {
    console.error("Error processing close session request:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Error processing request",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 200, // クライアントにはエラーではなく成功を返す
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
