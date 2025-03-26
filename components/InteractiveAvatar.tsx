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
  Switch,
  Badge,
  Tooltip,
} from "@nextui-org/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMemoizedFn, usePrevious } from "ahooks";

import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";
import { useFaceRecognition, RecognizedFace } from "./useFaceRecognition";
import FaceRecognitionUI from "./FaceRecognitionUI";

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

  // カメラ関連の状態変数を追加
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraDescription, setCameraDescription] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // カメラ分析用の参照
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cameraAnalysisInterval = useRef<NodeJS.Timeout | null>(null);
  
  // ビデオ要素を動的に作成するためのref
  const faceVideoContainerRef = useRef<HTMLDivElement>(null);
  
  // 人物に挨拶する関数
  const greetPerson = async (person: string, isChild: boolean, gender: string) => {
    if (!avatar.current) return;

    try {
      let greeting = "";

      if (isChild) {
        greeting = `${person}くん、こんにちは！元気かな？今日はどんな楽しいことがあった？`;
      } else if (gender === "Male") {
        greeting = `${person}さん、こんにちは。お手伝いできることがあればお申し付けください。`;
      } else if (gender === "Female") {
        greeting = `${person}さん、いらっしゃいませ。何かお力になれることはありますか？`;
      } else {
        greeting = `${person}さん、こんにちは。何かご質問はありますか？`;
      }

      setDebug(`${person}さんに挨拶: ${greeting}`);
      console.log(`${person}さんに挨拶: ${greeting}`);

      await avatar.current.speak({
        text: greeting,
        taskType: TaskType.TALK,
        taskMode: TaskMode.SYNC,
      });
    } catch (error) {
      console.error("挨拶エラー:", error);
      setDebug(
        `挨拶エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    }
  };

  // 顔認識関連の統合 - useFaceRecognition フックを使用
  const {
    isEnabled: faceRecognitionEnabled,
    isAnalyzing: isFaceAnalyzing,
    isGreeting,
    recognizedFaces,
    currentFace,
    errorMessage: faceRecognitionError,
    startRecognition,
    stopRecognition,
    analyzeCurrentFrame: analyzeFace,
    resetRecognizedFaces
  } = useFaceRecognition(
    'face-recognition-video',
    'face-recognition-canvas',
    greetPerson,
    message => setDebug(message),
    {
      greetingCooldown: 60000, // 同じ人への挨拶のクールダウン（ミリ秒）
      recognitionInterval: 5000, // 顔認識の実行間隔（ミリ秒）
      confidenceThreshold: 70 // 顔認識の確信度の閾値（％）
    }
  );

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
      // セッション終了時に顔認識も停止
      stopRecognition();
    };
  }, [sessionId, stopRecognition]);

  // セッションクリーンアップの状態を追跡
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  async function cleanupPreviousSession(previousSessionId: string) {
    // 既にクリーンアップ中なら実行しない
    if (isCleaningUp) {
      console.log("既にクリーンアップ中です。スキップします。");
      return;
    }

    try {
      setIsCleaningUp(true);
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
    } finally {
      setIsCleaningUp(false);
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
      // AudioContextを初期化（ユーザージェスチャーの一部として実行される）
      initAudioContext();
      setDebug("AudioContext初期化完了");

      // 既存のセッションがある場合はクリーンアップ
      if (sessionId) {
        setDebug("前回のセッションをクリーンアップ中...");
        await cleanupPreviousSession(sessionId);
      }

      // 保存されているセッションIDがある場合はクリーンアップ
      const savedSessionId = localStorage.getItem("heygen_session_id");
      if (savedSessionId && savedSessionId !== sessionId) {
        setDebug("保存されているセッションをクリーンアップ中...");
        await cleanupPreviousSession(savedSessionId);
      }

      setDebug("アクセストークン取得中...");
      const newToken = await fetchAccessToken();

      if (!newToken) {
        throw new Error("アクセストークンの取得に失敗しました");
      }

      setDebug("StreamingAvatarを初期化中...");
      
      // 既存のインスタンスをクリーンアップ
      if (avatar.current) {
        try {
          await avatar.current.stopAvatar();
        } catch (e) {
          console.log("既存のアバターインスタンスのクリーンアップ中にエラーが発生しました:", e);
        }
        avatar.current = null;
      }
      
      // 新しいインスタンスを作成
      avatar.current = new StreamingAvatar({
        token: newToken,
      });

      // イベントリスナーの設定
      setDebug("イベントリスナーを設定中...");

      // エラーイベントのリスナーを追加
      const handleWebSocketError = (event: Event) => {
        console.error("WebSocketエラー:", event);
        setDebug(`WebSocketエラー: 接続に失敗しました`);
        
        // エラーが発生した場合はセッションをクリーンアップ
        if (avatar.current) {
          try {
            avatar.current.stopAvatar().catch(e => console.error("停止中のエラー:", e));
          } catch (e) {
            console.error("アバターの停止中にエラーが発生しました:", e);
          }
        }
        
        // セッション状態をリセット
        setIsStartingSession(false);
        setIsLoadingSession(false);
      };
      
      // Windowレベルのエラーリスナー
      window.addEventListener("error", handleWebSocketError);
      
      // 必要なイベントリスナーを設定
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
        enableIntroMessage: true, // イントロメッセージを有効化
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

      // セッション開始後、少し待ってからイントロメッセージを再生
      setTimeout(() => {
        playIntroMessage();
      }, 2000);

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

  // イントロメッセージを手動で再生する関数
  const playIntroMessage = async () => {
    if (!avatar.current) {
      setDebug("アバターが初期化されていません");
      return;
    }

    try {
      setDebug("イントロメッセージを再生中...");
      // イントロメッセージを再生するためのAPIコール
      await avatar.current.speak({
        text: "こんにちは！何かお手伝いできることはありますか？",
        taskType: TaskType.TALK, // INTROではなくTALKを使用
        taskMode: TaskMode.SYNC,
      });
    } catch (error) {
      console.error("イントロメッセージ再生エラー:", error);
      setDebug(
        `イントロメッセージ再生エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    }
  };

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
    setDebug("セッションを終了しています...");
    
    try {
      // エラーが発生しても処理を続行するため、各ステップを個別にtry-catchで囲む
      
      // 1. 顔認識を停止
      try {
        stopRecognition();
      } catch (error) {
        console.error("顔認識停止中にエラーが発生しました:", error);
      }
      
      // 2. アバターを停止
      if (avatar.current) {
        try {
          await avatar.current.stopAvatar();
        } catch (error) {
          console.error("アバター停止中にエラーが発生しました:", error);
        } finally {
          // エラーが発生してもリソースを解放する
          avatar.current = null;
        }
      }
      
      // 3. セッションIDをローカルストレージから削除
      if (sessionId) {
        try {
          localStorage.removeItem("heygen_session_id");
        } catch (error) {
          console.error("ローカルストレージ操作中にエラーが発生しました:", error);
        } finally {
          setSessionId("");
        }
      }
      
      // 4. ストリームとデータを初期化
      setStream(undefined);
      setData(undefined);
      
      setDebug("セッションが正常に終了しました");
    } catch (error) {
      console.error("セッション終了中に予期しないエラーが発生しました:", error);
      setDebug(`セッション終了エラー: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      // 状態をリセット
      setIsStartingSession(false);
      setIsLoadingSession(false);
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
  const initAudioContext = useCallback(() => {
    try {
      // AudioContextを初期化
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const audioCtx = new AudioContext();
        // すぐに再開する（ユーザーインタラクション後に呼び出されるため）
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            console.log('AudioContext resumed successfully');
          });
        }
        setDebug("AudioContextが初期化されました");
        
        // 無音の短い音を再生（ブラウザのオーディオエンジンを起動するため）
        try {
          const oscillator = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = 0; // 無音に設定
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          oscillator.start();
          oscillator.stop(audioCtx.currentTime + 0.001);
          console.log('Silent oscillator played successfully');
        } catch (oscError) {
          console.warn('Oscillator error:', oscError);
        }
      }
    } catch (error) {
      console.error("AudioContext初期化エラー:", error);
    }
  }, [setDebug]);

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

  // 顔認識の切り替え関数
  const toggleFaceRecognition = () => {
    console.log("顔認識ボタンがクリックされました");
    
    if (faceRecognitionEnabled) {
      console.log("顔認識を停止します");
      stopRecognition();
    } else {
      console.log("顔認識を開始します");
      startRecognition();
    }
  };

  // カメラ分析を開始する関数
  const startCameraAnalysis = async () => {
    try {
      // カメラへのアクセス許可を取得
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      // ビデオ要素にストリームを設定
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraEnabled(true);
        setDebug("カメラ分析を開始しました");

        // 定期的に画像を分析（5秒ごと）
        cameraAnalysisInterval.current = setInterval(async () => {
          await analyzeCurrentFrame();
        }, 5000); // 5秒ごとに分析
      }
    } catch (error) {
      console.error("カメラアクセスエラー:", error);
      setDebug(
        `カメラアクセスエラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    }
  };

  // 現在のフレームを分析する関数
  const analyzeCurrentFrame = async () => {
    if (isAnalyzing || !canvasRef.current || !videoRef.current) return;

    try {
      setIsAnalyzing(true);
      const context = canvasRef.current.getContext("2d");
      if (context) {
        // ビデオフレームをキャンバスに描画
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);

        // キャンバスから画像データを取得
        const imageData = canvasRef.current.toDataURL("image/jpeg", 0.7);

        // 画像分析APIを呼び出す
        setDebug("画像を分析中...");
        const response = await fetch("/api/analyze-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ image: imageData }),
        });

        if (response.ok) {
          const result = await response.json();
          setCameraDescription(result.description);
          setDebug(`画像分析結果: ${result.description}`);

          // 分析結果をLLMプロンプトに追加
          if (avatar.current && result.description) {
            await avatar.current.speak({
              text: `カメラに映っているものについて説明します: ${result.description}。これについてどう思いますか？`,
              taskType: TaskType.TALK,
              taskMode: TaskMode.SYNC,
            });
          }
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || "画像分析に失敗しました");
        }
      }
    } catch (error) {
      console.error("画像分析エラー:", error);
      setDebug(
        `画像分析エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 手動で現在のフレームを分析するボタン用の関数
  const analyzeCurrentFrameManually = () => {
    analyzeCurrentFrame();
  };

  // カメラ分析を停止する関数
  const stopCameraAnalysis = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    if (cameraAnalysisInterval.current) {
      clearInterval(cameraAnalysisInterval.current);
      cameraAnalysisInterval.current = null;
    }

    setCameraEnabled(false);
    setDebug("カメラ分析を停止しました");
  };

  // 顔認識UI要素
  const faceRecognitionUI = (
    <FaceRecognitionUI
      isEnabled={faceRecognitionEnabled}
      isAnalyzing={isFaceAnalyzing}
      isGreeting={isGreeting}
      recognizedFaces={recognizedFaces}
      currentFace={currentFace}
      errorMessage={faceRecognitionError}
      onStart={startRecognition}
      onStop={stopRecognition}
      onAnalyze={analyzeFace}
      onReset={resetRecognizedFaces}
      fullscreenMode={fullScreenMode}
    />
  );

  // UIに追加するカメラ関連の要素
  const cameraControls = (
    <div className="mt-4 border-t pt-4">
      <h3 className="text-lg font-medium mb-2">カメラ分析</h3>
      <Button
        color={cameraEnabled ? "danger" : "success"}
        variant="flat"
        onClick={cameraEnabled ? stopCameraAnalysis : startCameraAnalysis}
        className="w-full mb-2"
      >
        {cameraEnabled ? "カメラ分析を停止" : "カメラ分析を開始"}
      </Button>

      {cameraEnabled && (
        <div className="relative">
          <div className="flex justify-between mb-2">
            <small className="text-gray-500">カメラプレビュー</small>
            <Button
              size="sm"
              color="primary"
              isLoading={isAnalyzing}
              onClick={analyzeCurrentFrameManually}
              disabled={isAnalyzing}
            >
              今すぐ分析
            </Button>
          </div>
          <div
            className="rounded-lg overflow-hidden border"
            style={{ maxWidth: "300px", margin: "0 auto" }}
          >
            <video
              ref={videoRef}
              style={{ width: "100%", height: "auto" }}
              muted
              playsInline
            />
          </div>
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {cameraDescription && (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p className="text-sm">{cameraDescription}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

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
                  onPress={handleInterrupt}
                >
                  Interrupt task
                </Button>
                <Button
                  className="bg-gradient-to-tr from-indigo-500 to-indigo-300  text-white rounded-lg"
                  size="md"
                  variant="shadow"
                  onPress={endSession}
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
                  aria-label="Example avatars selection"
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
                  aria-label="Language selection"
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
                onPress={startSession}
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
          <Button
            color="primary"
            variant="flat"
            onPress={toggleMicrophone}
            isDisabled={!sessionId || isLoadingSession}
            className="w-full"
          >
            {isMicActive ? "マイクをオフにする" : "マイクをオンにする"}
          </Button>
          <div className="flex gap-2 justify-between">
            <Button
              color="primary"
              variant="ghost"
              size="sm"
              onPress={toggleSettings}
              isDisabled={!sessionId || isLoadingSession}
            >
              {showSettings ? "設定を閉じる" : "設定を表示"}
            </Button>
            {debug && (
              <div className="text-xs text-gray-500 flex items-center gap-3">
                <Spinner size="sm" className={isLoadingSession ? "" : "hidden"} />
                {debug}
              </div>
            )}
          </div>
          {showSettings && (
            <div className="w-full flex flex-col gap-2">
              <Input
                label="Custom System Prompt"
                placeholder="Enter a custom system prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                isDisabled={isLoadingSession}
                size="sm"
              />
              <div className="flex gap-2">
                <Select
                  label="LLM Provider"
                  placeholder="Select provider"
                  aria-label="LLM Provider selection"
                  className="max-w-xs"
                  selectedKeys={[llmProvider]}
                  onChange={(e) => {
                    setLlmProvider(e.target.value);
                  }}
                  size="sm"
                  isDisabled={isLoadingSession}
                >
                  <SelectItem key="openai">OpenAI</SelectItem>
                  <SelectItem key="anthropic">Anthropic</SelectItem>
                </Select>
                <Select
                  label="LLM Model"
                  placeholder="Select model"
                  aria-label="LLM Model selection"
                  className="max-w-xs"
                  selectedKeys={[llmModel]}
                  onChange={(e) => {
                    setLlmModel(e.target.value);
                  }}
                  size="sm"
                  isDisabled={isLoadingSession}
                >
                  <SelectItem key="gpt-4">GPT-4</SelectItem>
                  <SelectItem key="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                  <SelectItem key="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                  <SelectItem key="claude-3-opus">Claude 3 Opus</SelectItem>
                  <SelectItem key="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  color="primary"
                  onPress={saveSettings}
                  isDisabled={!sessionId || isLoadingSession}
                  isLoading={isLoadingSession}
                  className="mt-2"
                >
                  設定を保存して再起動
                </Button>
              </div>
            </div>
          )}
        </CardFooter>
        <Divider />
        <CardFooter className="flex flex-col gap-3 w-full">
          {/* 顔認識UI要素を追加 */}
          {faceRecognitionUI}

          {/* カメラ分析UI要素を追加 */}
          {cameraControls}
        </CardFooter>
      </Card>
    </div>
  );
}