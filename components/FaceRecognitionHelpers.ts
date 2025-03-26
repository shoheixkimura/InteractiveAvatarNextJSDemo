/**
 * 顔認識機能のヘルパー関数
 *
 * このモジュールには、顔認識機能に関連した再利用可能な関数が含まれています。
 * 様々なコンポーネントから呼び出されます。
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
    if (!videoElement) {
      throw new Error("ビデオ要素が提供されていません");
    }

    if (!stream) {
      throw new Error("メディアストリームが提供されていません");
    }

    // ビデオ要素にストリームを設定
    videoElement.srcObject = stream;
    videoElement.muted = true; // 音声フィードバックを防止
    videoElement.playsInline = true; // モバイルでのインライン再生を有効化

    // loadedmetadata イベントを待ってから再生開始
    const playPromise = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("ビデオ読み込みタイムアウト"));
      }, 10000); // 10秒タイムアウト
      
      videoElement.onloadedmetadata = async () => {
        clearTimeout(timeoutId);
        try {
          await videoElement.play();
          resolve();
        } catch (playError) {
          reject(playError);
        }
      };
      
      videoElement.onerror = (event) => {
        clearTimeout(timeoutId);
        reject(new Error(`ビデオエラー: ${videoElement.error?.message || "不明なエラー"}`));
      };
    });
    
    await playPromise;
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
    if (!videoElement || !canvasElement) {
      throw new Error("ビデオ要素またはキャンバス要素が提供されていません");
    }

    // ビデオがready状態かチェック
    if (videoElement.readyState < 2) { // HAVE_CURRENT_DATA
      throw new Error("ビデオはまだキャプチャの準備ができていません");
    }

    // ビデオのサイズが有効かチェック
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      throw new Error("ビデオのサイズが無効です");
    }

    console.log("顔分析のための画像をキャプチャします");

    const context = canvasElement.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Canvasコンテキストを取得できませんでした");
    }

    // ビデオフレームをキャンバスに描画
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    context.drawImage(videoElement, 0, 0);
    console.log(`ビデオフレームをキャンバスに描画しました (${canvasElement.width}x${canvasElement.height})`);

    // キャンバスから画像データを取得 (圧縮率を調整して品質と容量のバランスを取る)
    const imageData = canvasElement.toDataURL("image/jpeg", 0.8);
    
    // データサイズの確認と調整
    if (imageData.length > 1000000) { // 1MB以上の場合は圧縮率を下げる
      console.log("画像サイズが大きいため、圧縮率を下げて再取得します");
      const reducedImageData = canvasElement.toDataURL("image/jpeg", 0.6);
      console.log("画像データを取得しました（長さ:", reducedImageData.length, "）");
      
      // 顔認識APIを呼び出す
      return await sendImageToAPI(reducedImageData);
    }
    
    console.log("画像データを取得しました（長さ:", imageData.length, "）");
    
    // 顔認識APIを呼び出す
    return await sendImageToAPI(imageData);
  } catch (error) {
    console.error("顔認識処理中にエラーが発生しました:", error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error("不明なエラー")
    };
  }
};

/**
 * 画像データをAPIに送信する関数
 * 
 * @param imageData - Base64エンコードされた画像データ
 * @returns Promise<{success: boolean, data?: any, error?: Error}> - APIレスポンスのPromise
 */
const sendImageToAPI = async (imageData: string): Promise<{success: boolean, data?: any, error?: Error}> => {
  try {
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
      const errorData = await response.json().catch(() => ({ error: "レスポンスの解析に失敗しました" }));
      throw new Error(errorData.error || `顔認識APIからエラーレスポンスを受け取りました (${response.status})`);
    }

    const result = await response.json();
    console.log("顔認識結果:", result);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error("API呼び出し中にエラーが発生しました:", error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error("不明なエラー")
    };
  }
};