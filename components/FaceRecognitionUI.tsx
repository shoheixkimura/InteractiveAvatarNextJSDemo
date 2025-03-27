import { Badge, Button, Tooltip, Progress, Card, CardBody, Divider, Switch } from "@nextui-org/react";
import { useCallback, useState } from "react";
import { RecognizedFace } from './useFaceRecognition';

interface FaceRecognitionUIProps {
  isEnabled: boolean;
  isAnalyzing: boolean;
  isGreeting: boolean;
  recognizedFaces: RecognizedFace[];
  errorMessage: string;
  onStart: () => Promise<void>;
  onStop: () => void;
  onAnalyze: () => Promise<void>;
  onReset?: () => void; // 認識履歴をリセットする関数（オプション）
  fullscreenMode?: boolean;
  currentFace?: RecognizedFace | null; // 現在認識中の顔情報
}

/**
 * 顔認識機能のUIコンポーネント - 改善版
 */
export default function FaceRecognitionUI({
  isEnabled,
  isAnalyzing,
  isGreeting,
  recognizedFaces,
  errorMessage,
  onStart,
  onStop,
  onAnalyze,
  onReset,
  fullscreenMode = false,
  currentFace = null
}: FaceRecognitionUIProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // 顔認識の切り替え関数
  const handleToggle = useCallback(() => {
    if (isEnabled) {
      onStop();
    } else {
      onStart();
    }
  }, [isEnabled, onStart, onStop]);

  // 設定パネルの切り替え
  const toggleSettings = useCallback(() => {
    setShowSettings(!showSettings);
    setShowHelp(false);
  }, [showSettings]);

  // ヘルプパネルの切り替え
  const toggleHelp = useCallback(() => {
    setShowHelp(!showHelp);
    setShowSettings(false);
  }, [showHelp]);

  // 認識履歴のリセット
  const handleReset = useCallback(() => {
    if (onReset) {
      onReset();
    }
  }, [onReset]);

  // 顔アイコンコンポーネント
  const FaceIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  );

  // 設定アイコンコンポーネント
  const SettingsIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  // ヘルプアイコンコンポーネント
  const HelpIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );

  // リセットアイコンコンポーネント
  const ResetIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );

  // フルスクリーンモード用のフローティングボタン
  if (fullscreenMode) {
    return (
      <>
        {/* メインの顔認識ボタン */}
        <Button
          onPress={handleToggle}
          className={`absolute bottom-8 left-24 p-4 rounded-full ${
            isEnabled ? "bg-purple-500" : "bg-gray-500"
          } text-white shadow-lg transition-all duration-300 hover:scale-110`}
          style={{ zIndex: 1000 }}
          isDisabled={isAnalyzing || isGreeting}
        >
          <FaceIcon />
          {isAnalyzing && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>}
          {isGreeting && <span className="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-full animate-pulse"></span>}
        </Button>

        {/* 設定ボタン */}
        <Button
          onPress={toggleSettings}
          className="absolute bottom-8 left-8 p-3 rounded-full bg-gray-700 text-white shadow-lg transition-all duration-300 hover:scale-110"
          style={{ zIndex: 1000 }}
          isDisabled={!isEnabled}
        >
          <SettingsIcon />
        </Button>

        {/* ヘルプボタン */}
        <Button
          onPress={toggleHelp}
          className="absolute bottom-24 left-8 p-3 rounded-full bg-blue-600 text-white shadow-lg transition-all duration-300 hover:scale-110"
          style={{ zIndex: 1000 }}
        >
          <HelpIcon />
        </Button>

        {/* 認識された人物リスト */}
        {isEnabled && recognizedFaces.length > 0 && (
          <div className="absolute top-2 left-2 bg-black bg-opacity-70 backdrop-blur-sm rounded-lg p-3 text-white max-w-xs" style={{ zIndex: 999 }}>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-bold">認識された人物:</h3>
              {onReset && (
                <Button
                  size="sm"
                  isIconOnly
                  variant="light"
                  onPress={handleReset}
                  className="text-white"
                >
                  <ResetIcon />
                </Button>
              )}
            </div>
            <ul className="text-xs max-h-40 overflow-y-auto">
              {recognizedFaces.map((face, index) => (
                <li key={index} className="mb-2 pb-2 border-b border-gray-700 last:border-none">
                  <div className="font-semibold">{face.person}さん</div>
                  <div className="text-gray-300 flex justify-between">
                    <span>{face.isChild ? "子供" : "大人"}</span>
                    <span>{face.gender === "Male" ? "男性" : face.gender === "Female" ? "女性" : "不明"}</span>
                    <span>{face.confidence ? `${face.confidence.toFixed(1)}%` : ""}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 設定パネル */}
        {isEnabled && showSettings && (
          <div className="absolute left-2 bottom-24 bg-black bg-opacity-70 backdrop-blur-sm rounded-lg p-3 text-white max-w-xs" style={{ zIndex: 999 }}>
            <h3 className="text-sm font-bold mb-2">顔認識設定</h3>
            <div className="text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span>自動認識</span>
                <Switch size="sm" defaultSelected isDisabled />
              </div>
              <div className="flex justify-between items-center">
                <span>認識間隔</span>
                <span>5秒</span>
              </div>
              <Divider className="my-2" />
              <Button
                size="sm"
                color="primary"
                onClick={onAnalyze}
                isDisabled={isAnalyzing || isGreeting}
                isLoading={isAnalyzing}
                fullWidth
              >
                今すぐ分析
              </Button>
            </div>
          </div>
        )}

        {/* ヘルプパネル */}
        {showHelp && (
          <div className="absolute left-2 bottom-24 bg-black bg-opacity-70 backdrop-blur-sm rounded-lg p-3 text-white max-w-xs" style={{ zIndex: 999 }}>
            <h3 className="text-sm font-bold mb-2">顔認識機能について</h3>
            <div className="text-xs space-y-2">
              <p>この機能はカメラを使って目の前にいる人の顔を認識し、名前で挨拶します。</p>
              <p>顔の登録はサーバーに「人の名前.jpg」の形式で画像を保存してください。</p>
              <p>子供と判定された場合は、より親しみやすい挨拶をします。</p>
              <div className="mt-2 pt-2 border-t border-gray-600">
                <p className="font-semibold">対応状況</p>
                <ul className="list-disc list-inside">
                  <li>AWSのRekognitionを使用して顔認識を行います</li>
                  <li>一度認識した人には一定時間内に再度挨拶しません</li>
                  <li>子供/大人、男性/女性を自動判定します</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* エラーメッセージ - 改善版 */}
        {errorMessage && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-red-500 bg-opacity-90 text-white px-4 py-2 rounded-lg max-w-xs text-center" style={{ zIndex: 1001 }}>
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{errorMessage}</span>
            </div>
            {errorMessage.includes('カメラ') && (
              <div className="text-xs mt-2 border-t border-red-400 pt-2">
                <p>解決策: カメラへのアクセス許可を確認し、ブラウザの設定を確認してください。</p>
              </div>
            )}
            {errorMessage.includes('失敗') && (
              <div className="text-xs mt-2 border-t border-red-400 pt-2">
                <p>解決策: 顔認識を停止して再開してみてください。問題が解決しない場合はページを再読み込みしてください。</p>
              </div>
            )}
          </div>
        )}

        {/* 現在分析中/挨拶中の状態表示 - 改善版 */}
        {isEnabled && (isAnalyzing || isGreeting) && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-center" style={{ zIndex: 1001 }}>
            {isAnalyzing && (
              <div className="flex items-center space-x-2">
                <span className="animate-pulse">顔を分析中...</span>
                <Progress
                  size="sm"
                  isIndeterminate
                  aria-label="分析中"
                  className="max-w-24"
                  color="primary"
                />
              </div>
            )}
            {isGreeting && !isAnalyzing && (
              <div className="flex flex-col items-center">
                <div className="flex items-center space-x-2">
                  <span className="animate-pulse text-blue-300">●</span>
                  <span>挨拶中: <span className="font-bold">{currentFace?.person}さん</span></span>
                </div>
                {currentFace && (
                  <div className="text-xs mt-1 text-blue-200">
                    {currentFace.isChild ? '子供' : '大人'} / {currentFace.gender === 'Male' ? '男性' : currentFace.gender === 'Female' ? '女性' : '不明'}
                    {currentFace.emotion && ` / 感情: ${currentFace.emotion}`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* 顔認識ステータスバッジ */}
        {isEnabled && !isAnalyzing && !isGreeting && (
          <div className="absolute top-2 right-20 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-full" style={{ zIndex: 998 }}>
            <div className="flex items-center">
              <span className="inline-block w-2 h-2 mr-1 bg-green-500 rounded-full"></span>
              <span>顔認識: オン</span>
            </div>
          </div>
        )}

        {/* 顔認識用カメラのプレビューとキャンバス */}
        {isEnabled && (
          <div className="absolute top-2 right-2 w-64 h-48 bg-black bg-opacity-50 rounded-lg overflow-hidden shadow-lg" style={{ zIndex: 998 }}>
            <div className="w-full h-full">
              <video
                id="face-recognition-video"
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />
              <canvas
                id="face-recognition-canvas"
                style={{ display: "none" }}
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 backdrop-blur-sm text-white text-xs p-2">
              {isAnalyzing ? (
                <span className="flex items-center">
                  <span className="inline-block w-2 h-2 mr-1 bg-red-500 rounded-full animate-pulse"></span>
                  顔分析中...
                </span>
              ) : isGreeting ? (
                <span className="flex items-center">
                  <span className="inline-block w-2 h-2 mr-1 bg-blue-500 rounded-full animate-pulse"></span>
                  挨拶中
                </span>
              ) : (
                <span className="flex items-center">
                  <span className="inline-block w-2 h-2 mr-1 bg-green-500 rounded-full"></span>
                  顔認識モード: オン
                </span>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // 通常表示モード用の標準UI
  return (
    <Card className="mt-4">
      <CardBody className="gap-3">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium flex items-center">
            顔認識
            <Tooltip content="カメラを使って、映っている人の顔を認識し名前で挨拶します">
              <Badge className="ml-2" color="primary" variant="flat">新機能</Badge>
            </Tooltip>
          </h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              isIconOnly
              variant="light"
              onPress={toggleHelp}
              className="text-default-500"
            >
              <HelpIcon />
            </Button>
            {onReset && (
              <Button
                size="sm"
                isIconOnly
                variant="light"
                onPress={handleReset}
                className="text-default-500"
                isDisabled={!isEnabled || recognizedFaces.length === 0}
              >
                <ResetIcon />
              </Button>
            )}
          </div>
        </div>

        <Button
          color={isEnabled ? "danger" : "success"}
          variant="flat"
          onPress={handleToggle}
          className="w-full"
          startContent={<FaceIcon />}
          isDisabled={isAnalyzing || isGreeting}
          isLoading={isAnalyzing && !isEnabled}
        >
          {isEnabled ? "顔認識を停止" : "顔認識を開始"}
        </Button>

        {/* エラーメッセージ - 改善版 */}
        {errorMessage && (
          <div className="p-2 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm">{errorMessage}</span>
            </div>
            {(errorMessage.includes('カメラ') || errorMessage.includes('video')) && (
              <div className="ml-7 text-xs mt-1">
                <p>解決策: カメラへのアクセス許可を確認し、ブラウザの設定を確認してください。</p>
              </div>
            )}
            {errorMessage.includes('失敗') && (
              <div className="ml-7 text-xs mt-1">
                <p>解決策: 顔認識を停止して再開してみてください。</p>
              </div>
            )}
          </div>
        )}

        {showHelp && (
          <div className="p-3 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-lg text-sm">
            <p className="font-medium mb-1">顔認識機能の使い方</p>
            <ul className="list-disc list-inside text-xs space-y-1">
              <li>「顔認識を開始」ボタンを押すとカメラが起動します</li>
              <li>カメラに映った人物の顔が登録されていれば、名前で挨拶します</li>
              <li>顔画像の登録は「人の名前.jpg」の形式でサーバーに保存します</li>
              <li>子供と判定された場合は、より親しみやすい挨拶をします</li>
              <li>同じ人物には一定時間（デフォルト1分）以内に再度挨拶しません</li>
            </ul>
          </div>
        )}

        {isEnabled && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-default-500">カメラプレビュー</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  color="primary"
                  isLoading={isAnalyzing}
                  onPress={onAnalyze}
                  isDisabled={isAnalyzing || isGreeting}
                >
                  今すぐ分析
                </Button>
                <Button
                  size="sm"
                  isIconOnly
                  variant="bordered"
                  onPress={toggleSettings}
                  className="text-default-500"
                >
                  <SettingsIcon />
                </Button>
              </div>
            </div>

            {/* カメラプレビュー - 改善版 */}
            <div
              className="rounded-lg overflow-hidden border border-default-200 dark:border-default-100/20 bg-black relative"
              style={{ maxWidth: "100%", height: "200px", margin: "0 auto" }}
            >
              <video
                id="face-recognition-video"
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />
              <canvas
                id="face-recognition-canvas"
                style={{ display: "none" }}
              />

              {/* ステータスオーバーレイ - 改善版 */}
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2">
                {isAnalyzing ? (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <span className="inline-block w-2 h-2 mr-1 bg-red-500 rounded-full animate-pulse"></span>
                      顔分析中...
                    </span>
                    <Progress
                      size="sm"
                      isIndeterminate
                      aria-label="分析中"
                      className="max-w-24"
                      color="primary"
                    />
                  </div>
                ) : isGreeting ? (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <span className="inline-block w-2 h-2 mr-1 bg-blue-500 rounded-full animate-pulse"></span>
                      挨拶中: {currentFace?.person}さん
                    </span>
                    <span className="text-xs">
                      {currentFace?.isChild ? "子供" : "大人"}/{currentFace?.gender === "Male" ? "男性" : "女性"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center">
                      <span className="inline-block w-2 h-2 mr-1 bg-green-500 rounded-full"></span>
                      認識待機中
                    </span>
                    <span className="text-gray-300">5秒ごとに自動分析</span>
                  </div>
                )}
              </div>
            </div>

            {/* 設定パネル - 改善版 */}
            {showSettings && (
              <div className="p-3 bg-default-100 dark:bg-default-50/10 rounded-lg text-sm">
                <h4 className="text-sm font-medium mb-2">顔認識設定</h4>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span>自動認識</span>
                    <Switch size="sm" defaultSelected isDisabled />
                  </div>
                  <div className="flex justify-between items-center">
                    <span>認識間隔</span>
                    <span>5秒</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>確信度閾値</span>
                    <span>70%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>挨拶クールダウン</span>
                    <span>60秒</span>
                  </div>
                  <Divider className="my-1" />
                  <div className="text-xs text-default-500">
                    <p>顔認識はAWS Rekognitionを使用して実行されます。</p>
                    <p>人物の登録は「/public/reference-faces/」ディレクトリに「名前.jpg」の形式で画像を保存してください。</p>
                  </div>
                </div>
              </div>
            )}

            {/* 認識された人物リスト - 改善版 */}
            {recognizedFaces.length > 0 && (
              <div className="p-3 bg-default-100 dark:bg-default-50/10 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-medium">認識された人物</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-default-500">{recognizedFaces.length}人</span>
                    {onReset && recognizedFaces.length > 0 && (
                      <Button 
                        size="sm" 
                        variant="flat" 
                        color="default" 
                        onClick={handleReset}
                        startContent={<ResetIcon />}
                      >
                        リセット
                      </Button>
                    )}
                  </div>
                </div>
                <ul className="text-xs space-y-2 max-h-40 overflow-y-auto">
                  {recognizedFaces.map((face, index) => (
                    <li key={index} className="flex justify-between items-center pb-2 border-b border-default-200 dark:border-default-100/20 last:border-none">
                      <div>
                        <div className="font-medium">{face.person}さん</div>
                        <div className="text-default-500 text-xs">
                          {face.isChild ? "子供" : "大人"} / {face.gender === "Male" ? "男性" : face.gender === "Female" ? "女性" : "不明"}
                          {face.emotion && ` / ${face.emotion}`}
                          {face.ageRange && ` / 推定${face.ageRange.low}-${face.ageRange.high}歳`}
                        </div>
                      </div>
                      {face.confidence && (
                        <Badge
                          color={face.confidence > 90 ? "success" : face.confidence > 80 ? "primary" : "warning"}
                          variant="flat"
                        >
                          {face.confidence.toFixed(1)}%
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}