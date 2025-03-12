import type { StartAvatarResponse } from "@heygen/streaming-avatar";

import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskMode,
  TaskType,
  VoiceEmotion,
} from "@heygen/streaming-avatar";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Divider,
  Input,
  Select,
  SelectItem,
  Spinner,
  Chip,
  Tabs,
  Tab,
} from "@nextui-org/react";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, usePrevious } from "ahooks";

import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";

import { AVATARS, STT_LANGUAGE_LIST } from "@/app/lib/constants";

interface InteractiveAvatarProps {
  fullScreenMode?: boolean;
  setFullScreenMode?: (mode: boolean) => void;
}

export default function InteractiveAvatar({
  fullScreenMode = false,
  setFullScreenMode = () => {},
}: InteractiveAvatarProps) {
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isLoadingRepeat, setIsLoadingRepeat] = useState(false);
  const [stream, setStream] = useState<MediaStream>();
  const [debug, setDebug] = useState<string>();
  const [knowledgeId, setKnowledgeId] = useState<string>(
    "d9d944d6a489422fbef04ad1493e7409"
  );
  const [avatarId, setAvatarId] = useState<string>(
    //"Shawn_Therapist_public"
    "cceeff67329f44c796048d50277375cf"
  );
  const [language, setLanguage] = useState<string>("ja");
  const [isMicActive, setIsMicActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");

  const [data, setData] = useState<StartAvatarResponse>();
  const [text, setText] = useState<string>("");
  const mediaStream = useRef<HTMLVideoElement>(null);
  const avatar = useRef<StreamingAvatar | null>(null);
  const [chatMode, setChatMode] = useState("voice_mode");
  const [isUserTalking, setIsUserTalking] = useState(false);

  const [customPrompt, setCustomPrompt] = useState<string>(
    "あなたは親切なアシスタントです。質問に対して、提供されたナレッジベースの情報を優先的に使用して回答してください。ナレッジベースに情報がない場合は、一般的な知識に基づいて回答してください。HeyGenやインタラクティブアバターについての説明は避け、ユーザーの質問に直接関連する内容だけを話してください。"
  );
  const [llmProvider, setLlmProvider] = useState<string>("openai");
  const [llmModel, setLlmModel] = useState<string>("gpt-4");

  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;

  // セッション開始状態を追跡する新しい状態変数
  const [isStartingSession, setIsStartingSession] = useState(false);

  // この1行を追加
  const isInitialMount = useRef(true);

  useEffect(() => {
    const savedSessionId = localStorage.getItem("heygen_session_id");
    if (savedSessionId) {
      cleanupPreviousSession(savedSessionId);
    }

    const handleBeforeUnload = async () => {
      if (sessionId) {
        try {
          localStorage.setItem("heygen_session_id", sessionId);

          if (avatar.current) {
            await avatar.current.stopAvatar();
          } else {
            await fetch("/api/close-session", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ sessionId }),
            });
          }
        } catch (error) {
          console.error("セッション終了中にエラーが発生しました。:", error);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (avatar.current && sessionId) {
        avatar.current.stopAvatar().catch(console.error);
      }
    };
  }, [sessionId]);

  async function cleanupPreviousSession(previousSessionId: string) {
    try {
      console.log("前回のセッションをクリーンアップ中:", previousSessionId);

      await fetch("/api/close-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: previousSessionId }),
      });

      localStorage.removeItem("heygen_session_id");

      console.log("前回のセッションをクリーンアップしました");
    } catch (error) {
      console.error(
        "前回のセッションのクリーンアップ中にエラーが発生しました:",
        error
      );
    }
  }

  async function fetchAccessToken() {
    try {
      setDebug("アクセストークンをリクエスト中...");
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          `アクセストークン取得エラー: ${response.status} ${response.statusText}${
            errorData
              ? ` - ${errorData.details || errorData.error || JSON.stringify(errorData)}`
              : ""
          }`
        );
      }

      const token = await response.text();
      console.log("Access Token:", token);

      if (!token || token.trim() === "") {
        throw new Error("空のアクセストークンが返されました");
      }

      setDebug("アクセストークンを取得しました");
      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      setDebug(
        `アクセストークン取得エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
      throw error; // エラーを再スローして呼び出し元で処理できるようにする
    }
  }

  async function startSession() {
    // 既にセッション開始中なら何もしない
    if (isStartingSession || isLoadingSession) return;

    setIsStartingSession(true);
    setIsLoadingSession(true);
    setDebug("セッション開始中...");

    try {
      // AudioContextを初期化（LiveKitの問題対策）
      initAudioContext();

      if (sessionId) {
        setDebug("前回のセッションをクリーンアップ中...");
        await cleanupPreviousSession(sessionId);
      }

      setDebug("アクセストークン取得中...");
      const newToken = await fetchAccessToken();

      if (!newToken) {
        throw new Error("アクセストークンの取得に失敗しました");
      }

      setDebug("StreamingAvatarを初期化中...");
      avatar.current = new StreamingAvatar({
        token: newToken,
      });

      // イベントリスナーの設定
      setDebug("イベントリスナーを設定中...");

      avatar.current.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
        console.log("Avatar started talking", e);
        setDebug("アバターが話し始めました");
      });

      avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
        console.log("Avatar stopped talking", e);
        setDebug("アバターが話し終わりました");
      });

      avatar.current.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        console.log("Stream disconnected");
        setDebug("ストリームが切断されました");
        endSession();
      });

      avatar.current.on(StreamingEvents.STREAM_READY, (event) => {
        console.log("Stream ready:", event.detail);
        setDebug("ストリームの準備ができました");
        setStream(event.detail);
      });

      avatar.current.on(StreamingEvents.USER_START, (event) => {
        console.log("User started talking:", event);
        setDebug("ユーザーが話し始めました");
        setIsUserTalking(true);
      });

      avatar.current.on(StreamingEvents.USER_STOP, (event) => {
        console.log("User stopped talking:", event);
        setDebug("ユーザーが話し終わりました");
        setIsUserTalking(false);
      });

      // エラーイベントのリスナーを追加
      // StreamingEvents.ERRORは存在しないため、一般的なエラーハンドリングを強化
      window.addEventListener("error", (event) => {
        console.error("Window error:", event);
        setDebug(`ウィンドウエラー: ${event.message}`);
      });

      setDebug("アバターセッション作成中...");
      const res = await avatar.current.createStartAvatar({
        quality: AvatarQuality.Medium,
        avatarName: avatarId,
        knowledgeId: knowledgeId,
        voice: {
          rate: 1.2,
          emotion: VoiceEmotion.FRIENDLY,
        },
        language: language,
        disableIdleTimeout: true,
        llm: {
          provider: llmProvider,
          model: llmModel,
          systemPrompt: customPrompt,
        },
      } as any);

      console.log("Avatar session response:", res);

      // session_idプロパティを確認（HeyGen APIはスネークケースを使用）
      if (res && (res.sessionId || res.session_id)) {
        const sessionIdValue = res.sessionId || res.session_id;
        setSessionId(sessionIdValue);
        localStorage.setItem("heygen_session_id", sessionIdValue);
        setDebug(`セッションID: ${sessionIdValue}`);
      } else {
        console.error("セッションIDが取得できませんでした。レスポンス:", res);
        throw new Error("セッションIDが取得できませんでした");
      }

      setData(res);

      setDebug("音声チャット開始中...");
      await avatar.current.startVoiceChat({
        useSilencePrompt: false,
      });

      // マイクの権限を確認
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop()); // 確認後にストリームを停止
        setDebug("マイクの権限が許可されています");
      } catch (micError) {
        console.error("マイクの権限エラー:", micError);
        setDebug(
          `マイクの権限が許可されていません: ${micError instanceof Error ? micError.message : "不明なエラー"}`
        );
      }

      setChatMode("voice_mode");
      setDebug("セッション開始完了");
    } catch (error) {
      console.error("Error starting avatar session:", error);
      setDebug(
        `セッション開始エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );

      if (fullScreenMode) {
        setStream(undefined);
        setFullScreenMode(false);
      }

      // エラー発生時にアバターインスタンスをクリーンアップ
      if (avatar.current) {
        try {
          await avatar.current.stopAvatar();
        } catch (cleanupError) {
          console.error("Cleanup error:", cleanupError);
        }
        avatar.current = null;
      }
    } finally {
      setIsLoadingSession(false);
      setIsStartingSession(false);
    }
  }

  async function handleSpeak() {
    setIsLoadingRepeat(true);
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }
    await avatar.current
      .speak({ text: text, taskType: TaskType.REPEAT, taskMode: TaskMode.SYNC })
      .catch((e) => {
        setDebug(e.message);
      });
    setIsLoadingRepeat(false);
  }

  async function handleInterrupt() {
    if (!avatar.current) {
      setDebug("Avatar API not initialized");

      return;
    }
    await avatar.current.interrupt().catch((e) => {
      setDebug(e.message);
    });
  }

  async function endSession() {
    try {
      if (avatar.current) {
        await avatar.current.stopAvatar();

        if (sessionId) {
          localStorage.removeItem("heygen_session_id");
          setSessionId("");
        }

        avatar.current = null;
      }

      setStream(undefined);
      setData(undefined);
    } catch (error) {
      console.error("Error ending avatar session:", error);
    }
  }

  const toggleMicrophone = async () => {
    try {
      if (isMicActive) {
        setDebug("マイクをオフにしています...");
        await avatar.current?.stopListening();
        setIsMicActive(false);
        setDebug("マイクがオフになりました");
      } else {
        setDebug("マイクをオンにしています...");
        // マイクの権限を確認
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          stream.getTracks().forEach((track) => track.stop()); // 確認後にストリームを停止
        } catch (micError) {
          console.error("マイクの権限エラー:", micError);
          setDebug(
            `マイクの権限が許可されていません: ${micError instanceof Error ? micError.message : "不明なエラー"}`
          );
          return; // 権限がない場合は処理を中断
        }

        await avatar.current?.startListening();
        setIsMicActive(true);
        setDebug("マイクがオンになりました - 話しかけてください");
      }
    } catch (error) {
      console.error("マイク切り替えエラー:", error);
      setDebug(
        `マイク切り替えエラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    }
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  async function saveSettings() {
    try {
      setIsLoadingSession(true);

      if (avatar.current) {
        console.log("終了中のセッション:", sessionId);
        await avatar.current.stopAvatar();

        if (sessionId) {
          try {
            await fetch("/api/close-session", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ sessionId }),
            });
            console.log("セッションを正常に閉じました:", sessionId);
          } catch (closeError) {
            console.error("セッション終了APIエラー:", closeError);
          }

          localStorage.removeItem("heygen_session_id");
          setSessionId("");
        }

        avatar.current = null;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));

      setShowSettings(false);
      setStream(undefined);

      startSession();
    } catch (error) {
      console.error("設定の保存中にエラーが発生しました:", error);
      setDebug(
        `設定の保存中にエラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    } finally {
      setIsLoadingSession(false);
    }
  }

  const handleChangeChatMode = useMemoizedFn(async (v) => {
    if (v === chatMode) {
      return;
    }
    if (v === "text_mode") {
      avatar.current?.closeVoiceChat();
    } else {
      await avatar.current?.startVoiceChat();
    }
    setChatMode(v);
  });

  const previousText = usePrevious(text);
  useEffect(() => {
    if (!previousText && text) {
      avatar.current?.startListening();
    } else if (previousText && !text) {
      avatar?.current?.stopListening();
    }
  }, [text, previousText]);

  useEffect(() => {
    if (fullScreenMode && isInitialMount.current) {
      isInitialMount.current = false;
      // 自動セッション開始を無効化し、ユーザーインタラクション後に手動で開始するように変更
      // startSession();
    }

    return () => {
      endSession();
    };
  }, [fullScreenMode]);

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
        setDebug("Playing");
      };
    }
  }, [mediaStream, stream]);

  // AudioContextの問題に対処するための関数
  const initAudioContext = () => {
    try {
      // AudioContextを初期化
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const audioCtx = new AudioContext();
        // 一時的な音を生成して再生（無音）
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0; // 無音に設定
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.001);
        setDebug("AudioContextが初期化されました");

        // LiveKitのAudioContextを初期化するためのダミー音声再生
        const audio = new Audio();
        audio.src =
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audio.play().catch((e) => console.log("Silent audio play failed:", e));
      }
    } catch (error) {
      console.error("AudioContext初期化エラー:", error);
    }
  };

  // ページ読み込み時にクリックイベントリスナーを追加
  useEffect(() => {
    const handleUserInteraction = () => {
      initAudioContext();
      // 一度だけ実行するためにイベントリスナーを削除
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
      document.removeEventListener("keydown", handleUserInteraction);
    };

    document.addEventListener("click", handleUserInteraction);
    document.addEventListener("touchstart", handleUserInteraction);
    document.addEventListener("keydown", handleUserInteraction);

    return () => {
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
      document.removeEventListener("keydown", handleUserInteraction);
    };
  }, []);

  if (fullScreenMode) {
    return (
      <div className="w-screen h-screen overflow-hidden relative">
        {stream ? (
          <>
            <video
              ref={mediaStream}
              autoPlay
              playsInline
              style={{
                width: "100vw",
                height: "100vh",
                objectFit: "cover",
              }}
            >
              <track kind="captions" />
            </video>

            <button
              onClick={toggleMicrophone}
              className={`absolute bottom-8 right-8 p-4 rounded-full ${
                isMicActive ? "bg-red-500" : "bg-blue-500"
              } text-white shadow-lg transition-all duration-300 hover:scale-110`}
              style={{ zIndex: 1000 }}
            >
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
                {isMicActive ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </>
                ) : (
                  <>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </>
                )}
              </svg>
            </button>

            <button
              onClick={toggleSettings}
              className="absolute bottom-8 left-8 p-4 rounded-full bg-gray-700 text-white shadow-lg transition-all duration-300 hover:scale-110"
              style={{ zIndex: 1000 }}
            >
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
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>

            {isMicActive && (
              <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded-full">
                マイクがオンです - 話しかけてください
              </div>
            )}

            {showSettings && (
              <div
                className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center"
                style={{ zIndex: 2000 }}
              >
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-11/12 max-w-lg">
                  <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                    アバター設定
                  </h2>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      システムプロンプト
                    </label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={5}
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      LLMプロバイダー
                    </label>
                    <select
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="claude">Claude</option>
                      <option value="gemini">Gemini</option>
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      LLMモデル
                    </label>
                    <select
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="gpt-4">GPT-4</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      <option value="claude-3-opus">Claude 3 Opus</option>
                      <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                      <option value="gemini-pro">Gemini Pro</option>
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Custom Knowledge ID (オプション)
                    </label>
                    <input
                      type="text"
                      value={knowledgeId}
                      onChange={(e) => setKnowledgeId(e.target.value)}
                      placeholder="Custom Knowledge IDを入力"
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowSettings(false)}
                      className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={saveSettings}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                    >
                      保存して再起動
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center flex-col">
            <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-indigo-500 mb-8"></div>
            <button
              onClick={() => {
                initAudioContext();
                setTimeout(() => {
                  startSession();
                }, 500);
              }}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              セッションを手動で開始
            </button>
            <p className="mt-4 text-gray-600 dark:text-gray-300">
              ※ブラウザの制限により、ユーザーの操作後にセッションを開始する必要があります
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4">
      <Card>
        <CardBody className="h-[500px] flex flex-col justify-center items-center">
          {stream ? (
            <div className="h-[500px] w-[900px] justify-center items-center flex rounded-lg overflow-hidden">
              <video
                ref={mediaStream}
                autoPlay
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              >
                <track kind="captions" />
              </video>
              <div className="flex flex-col gap-2 absolute bottom-3 right-3">
                <Button
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
                  size="md"
                  variant="shadow"
                  onClick={handleInterrupt}
                >
                  Interrupt task
                </Button>
                <Button
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300  text-white rounded-lg"
                  size="md"
                  variant="shadow"
                  onClick={endSession}
                >
                  End session
                </Button>
              </div>
            </div>
          ) : !isLoadingSession ? (
            <div className="h-full justify-center items-center flex flex-col gap-8 w-[500px] self-center">
              <div className="flex flex-col gap-2 w-full">
                <p className="text-sm font-medium leading-none">
                  Custom Knowledge ID (optional)
                </p>
                <Input
                  placeholder="Enter a custom knowledge ID"
                  value={knowledgeId}
                  onChange={(e) => setKnowledgeId(e.target.value)}
                />
                <p className="text-sm font-medium leading-none">
                  Custom Avatar ID (optional)
                </p>
                <Input
                  placeholder="Enter a custom avatar ID"
                  value={avatarId}
                  onChange={(e) => setAvatarId(e.target.value)}
                />
                <Select
                  placeholder="Or select one from these example avatars"
                  size="md"
                  onChange={(e) => {
                    setAvatarId(e.target.value);
                  }}
                >
                  {AVATARS.map((avatar) => (
                    <SelectItem
                      key={avatar.avatar_id}
                      textValue={avatar.avatar_id}
                    >
                      {avatar.name}
                    </SelectItem>
                  ))}
                </Select>
                <Select
                  label="Select language"
                  placeholder="Select language"
                  className="max-w-xs"
                  selectedKeys={[language]}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                  }}
                >
                  {STT_LANGUAGE_LIST.map((lang) => (
                    <SelectItem key={lang.key}>{lang.label}</SelectItem>
                  ))}
                </Select>
              </div>
              <Button
                className="bg-gradient-to-tr from-indigo-500 to-indigo-300 w-full text-white"
                size="md"
                variant="shadow"
                onClick={startSession}
              >
                Start session
              </Button>
            </div>
          ) : (
            <Spinner color="default" size="lg" />
          )}
        </CardBody>
        <Divider />
        <CardFooter className="flex flex-col gap-3 relative">
          <Tabs
            aria-label="Options"
            selectedKey={chatMode}
            onSelectionChange={(v) => {
              handleChangeChatMode(v);
            }}
          >
            <Tab key="text_mode" title="Text mode" />
            <Tab key="voice_mode" title="Voice mode" />
          </Tabs>
          {chatMode === "text_mode" ? (
            <div className="w-full flex relative">
              <InteractiveAvatarTextInput
                disabled={!stream}
                input={text}
                label="Chat"
                loading={isLoadingRepeat}
                placeholder="Type something for the avatar to respond"
                setInput={setText}
                onSubmit={handleSpeak}
              />
              {text && (
                <Chip className="absolute right-16 top-3">Listening</Chip>
              )}
            </div>
          ) : (
            <div className="w-full text-center">
              <Button
                isDisabled={!isUserTalking}
                className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white"
                size="md"
                variant="shadow"
              >
                {isUserTalking ? "Listening" : "Voice chat"}
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
      <p className="font-mono text-right">
        <span className="font-bold">Console:</span>
        <br />
        {debug}
      </p>
    </div>
  );
}
