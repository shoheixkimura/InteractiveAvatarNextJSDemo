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
    // 入力パラメータの検証
    if (!videoElement) {
      throw new Error("ビデオ要素が提供されていません");
    }

    if (!stream) {
      throw new Error("メディアストリームが提供されていません");
    }

    if (!stream.active) {
      throw new Error("メディアストリームがアクティブではありません");
    }

    console.log("ビデオストリーム設定開始:", {
      videoElementExists: !!videoElement,
      streamExists: !!stream,
      streamActive: stream.active,
      streamTracks: stream.getTracks().map(t => ({
        kind: t.kind,
        label: t.label,
        enabled: t.enabled,
        state: t.readyState
      }))
    });

    // ビデオ要素にストリームを設定
    videoElement.srcObject = stream;
    videoElement.muted = true; // 音声フィードバックを防止
    videoElement.playsInline = true; // モバイルでのインライン再生を有効化
    videoElement.crossOrigin = "anonymous"; // CORS対策

    // loadedmetadata イベントを待ってから再生開始
    const playPromise = new Promise<void>((resolve, reject) => {
      // タイムアウト処理（10秒）
      const timeoutId = setTimeout(() => {
        cleanupEvents();
        console.error("ビデオ読み込みタイムアウト");
        reject(new Error("ビデオ読み込みタイムアウト - ブラウザの権限設定を確認してください"));
      }, 10000);

      // イベントクリーンアップ関数
      const cleanupEvents = () => {
        clearTimeout(timeoutId);
        videoElement.onloadedmetadata = null;
        videoElement.onloadeddata = null;
        videoElement.onerror = null;
      };

      // メタデータロード完了時の処理
      videoElement.onloadedmetadata = async () => {
        console.log("ビデオメタデータが読み込まれました:", {
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
          readyState: videoElement.readyState
        });

        // ビデオがデータを読み込んだ後に処理を続行
        videoElement.onloadeddata = async () => {
          cleanupEvents();
          try {
            // ビデオの再生を開始
            await videoElement.play();
            console.log("ビデオ再生を開始しました");
            resolve();
          } catch (playError) {
            console.error("ビデオ再生開始エラー:", playError);
            reject(new Error(`ビデオの再生に失敗しました: ${playError instanceof Error ? playError.message : "不明なエラー"}`));
          }
        };
      };

      // エラーハンドリング
      videoElement.onerror = (event) => {
        cleanupEvents();
        console.error("ビデオ要素エラー:", videoElement.error);
        reject(new Error(`ビデオエラー: ${videoElement.error?.message || "不明なエラー"}`));
      };
    });

    await playPromise;
    console.log("ビデオストリームの設定が完了しました");

    // 成功コールバックを呼び出す
    onSuccess();
  } catch (error) {
    console.error("ビデオストリーム設定エラー:", error);
    onError(error instanceof Error ? error : new Error(`ビデオストリーム設定エラー: ${String(error)}`));
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
    // 入力パラメータの検証
    if (!videoElement || !canvasElement) {
      throw new Error("ビデオ要素またはキャンバス要素が提供されていません");
    }

    // ビデオがready状態かチェック
    if (videoElement.readyState < 2) { // HAVE_CURRENT_DATA
      console.warn("ビデオはまだキャプチャの準備ができていません。状態:", videoElement.readyState);
      throw new Error("ビデオはまだキャプチャの準備ができていません。少し待ってから再試行してください。");
    }

    // ビデオのサイズが有効かチェック
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.error("ビデオサイズが無効です:", {
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
        readyState: videoElement.readyState,
        paused: videoElement.paused,
        ended: videoElement.ended
      });
      
      // カメラストリームの状態を確認
      const stream = videoElement.srcObject as MediaStream;
      if (stream) {
        const tracks = stream.getVideoTracks();
        console.log("ビデオトラック状態:", tracks.map(t => ({
          enabled: t.enabled,
          readyState: t.readyState,
          muted: t.muted
        })));
      }
      
      throw new Error("ビデオのサイズが無効です。カメラへのアクセス権限を確認してください。");
    }

    console.log("顔分析のための画像をキャプチャします", {
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
      readyState: videoElement.readyState
    });

    // キャンバスコンテキストの取得（パフォーマンス最適化を設定）
    const context = canvasElement.getContext("2d", {
      willReadFrequently: true,
      alpha: false  // 透明度が不要なので無効化してパフォーマンス向上
    });

    if (!context) {
      throw new Error("Canvasコンテキストを取得できませんでした");
    }

    // キャンバスのサイズをビデオフレームに合わせる
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    // ビデオフレームをキャンバスに描画
    try {
      context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
      console.log(`ビデオフレームをキャンバスに描画しました (${canvasElement.width}x${canvasElement.height})`);
    } catch (drawError) {
      console.error("キャンバス描画エラー:", drawError);
      throw new Error(`ビデオフレームの描画に失敗しました: ${drawError instanceof Error ? drawError.message : "不明なエラー"}`);
    }

    // キャンバスから画像データを取得（最適なサイズと品質）
    let imageData;
    let compressionQuality = 0.8; // 初期圧縮率（高品質）
    
    try {
      // まず画像サイズを確認して必要に応じて縮小
      const maxDimension = 1280; // 最大サイズを1280pxに制限
      let width = canvasElement.width;
      let height = canvasElement.height;
      
      // アスペクト比を維持しながらサイズを縮小
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
        
        // リサイズ用の一時キャンバスを作成
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempContext = tempCanvas.getContext('2d');
        
        if (tempContext) {
          tempContext.drawImage(canvasElement, 0, 0, width, height);
          imageData = tempCanvas.toDataURL("image/jpeg", compressionQuality);
          console.log(`画像をリサイズしました: ${canvasElement.width}x${canvasElement.height} -> ${width}x${height}`);
        } else {
          // リサイズできない場合は元のサイズで続行
          imageData = canvasElement.toDataURL("image/jpeg", compressionQuality);
        }
      } else {
        // リサイズ不要の場合はそのまま取得
        imageData = canvasElement.toDataURL("image/jpeg", compressionQuality);
      }
      
      console.log("画像データを取得しました。サイズ:", imageData.length);

      // データサイズが大きすぎる場合は圧縮率を下げる（1MB以上）
      if (imageData.length > 1000000) {
        console.log("画像サイズが大きいため、圧縮率を下げます:", imageData.length);
        compressionQuality = 0.6; // 圧縮率を下げる
        
        // リサイズした一時キャンバスがあればそれを使用
        if (typeof tempCanvas !== 'undefined') {
          imageData = tempCanvas.toDataURL("image/jpeg", compressionQuality);
        } else {
          imageData = canvasElement.toDataURL("image/jpeg", compressionQuality);
        }
        
        console.log("再圧縮後の画像サイズ:", imageData.length);

        // それでも大きい場合はさらに圧縮
        if (imageData.length > 800000) {
          compressionQuality = 0.4;
          
          if (typeof tempCanvas !== 'undefined') {
            imageData = tempCanvas.toDataURL("image/jpeg", compressionQuality);
          } else {
            imageData = canvasElement.toDataURL("image/jpeg", compressionQuality);
          }
          
          console.log("さらに圧縮後の画像サイズ:", imageData.length);
        }
      }
    } catch (imageError) {
      console.error("画像データ取得エラー:", imageError);
      throw new Error(`画像データの取得に失敗しました: ${imageError instanceof Error ? imageError.message : "不明なエラー"}`);
    }

    // 顔認識APIを呼び出す
    return await sendImageToAPI(imageData);
  } catch (error) {
    console.error("顔認識処理中にエラーが発生しました:", error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
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
    console.log("顔認識APIを呼び出します。データサイズ:", imageData.length);

    // APIリクエストの開始時間を記録
    const startTime = Date.now();

    // フェッチリクエストにタイムアウトを設定
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒タイムアウト

    try {
      const response = await fetch("/api/analyze-face", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: imageData }),
        signal: controller.signal
      });

      // タイムアウトタイマーをクリア
      clearTimeout(timeoutId);

      // APIリクエストの完了時間を記録
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;
      console.log(`APIレスポンスを受け取りました: ステータス=${response.status}, 処理時間=${elapsedTime}ms`);

      // レスポンスのステータスコードを確認
      if (!response.ok) {
        let errorMessage;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || `顔認識APIからエラーレスポンスを受け取りました (${response.status})`;
        } catch (jsonError) {
          errorMessage = `顔認識APIからエラーレスポンスを受け取りました (${response.status}): JSONの解析に失敗しました`;
        }

        console.error(errorMessage);
        throw new Error(errorMessage);
      }

      // 正常なレスポンスを解析
      const result = await response.json();
      console.log("顔認識結果:", result);

      // 成功フラグを確認
      if (!result.success) {
        return {
          success: false,
          error: new Error(result.message || "顔認識APIからエラーが返されました")
        };
      }

      return {
        success: true,
        data: result
      };
    } catch (fetchError) {
      // タイムアウトタイマーをクリア
      clearTimeout(timeoutId);
      
      // AbortErrorの場合はタイムアウトメッセージに変換
      if (fetchError.name === 'AbortError') {
        throw new Error("顔認識APIリクエストがタイムアウトしました（15秒）");
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error("API呼び出し中にエラーが発生しました:", error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(`API呼び出しエラー: ${String(error)}`)
    };
  }
};