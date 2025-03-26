/**
 * 顔認識機能のヘルパー関数
 * 
 * このモジュールには、顔認識機能に関連した再利用可能な関数が含まれています。
 * InteractiveAvatar.tsxから呼び出されます。
 */

/**
 * ビデオストリームと顔認識処理を設定する関数
 * 
 * @param videoElement - カメラストリームを表示するためのビデオ要素
 * @param stream - MediaStream オブジェクト
 * @param onSuccess - ビデオが正常に開始された後に呼び出されるコールバック
 * @param onError - エラー発生時に呼び出されるコールバック
 */
export const setupVideoStream = async (
  videoElement: HTMLVideoElement,
  stream: MediaStream,
  onSuccess: () => void,
  onError: (error: Error) => void
) => {
  try {
    // ビデオ要素にストリームを設定
    videoElement.srcObject = stream;
    
    // ビデオの再生を開始
    await videoElement.play();
    console.log("ビデオストリームの再生を開始しました");
    
    // 成功コールバックを呼び出す
    onSuccess();
  } catch (error) {
    console.error("ビデオストリーム設定エラー:", error);
    onError(new Error(`ビデオストリーム設定エラー: ${error instanceof Error ? error.message : "不明なエラー"}`));
  }
};

/**
 * 画像をキャプチャして顔認識APIに送信する関数
 * 
 * @param videoElement - カメラストリームを表示しているビデオ要素
 * @param canvasElement - 画像キャプチャ用のキャンバス要素
 * @returns Promise<{success: boolean, data?: any, error?: Error}> - APIレスポンスのPromise
 */
export const captureAndAnalyzeFace = async (
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement
): Promise<{success: boolean, data?: any, error?: Error}> => {
  try {
    console.log("顔分析のための画像をキャプチャします");
    
    const context = canvasElement.getContext("2d");
    if (!context) {
      throw new Error("Canvasコンテキストを取得できませんでした");
    }
    
    // ビデオフレームをキャンバスに描画
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    context.drawImage(videoElement, 0, 0);
    console.log("ビデオフレームをキャンバスに描画しました");
    
    // キャンバスから画像データを取得
    const imageData = canvasElement.toDataURL("image/jpeg", 0.7);
    console.log("画像データを取得しました（長さ:", imageData.length, "）");
    
    // 顔認識APIを呼び出す
    console.log("顔認識APIを呼び出します");
    const response = await fetch("/api/analyze-face", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: imageData }),
    });
    
    console.log("APIレスポンスを受け取りました:", response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "顔認識APIからエラーレスポンスを受け取りました");
    }
    
    const result = await response.json();
    console.log("顔認識結果:", result);
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error("顔認識処理中にエラーが発生しました:", error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error("不明なエラー")
    };
  }
};