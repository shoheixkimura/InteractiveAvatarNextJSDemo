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
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, usePrevious } from "ahooks";

import InteractiveAvatarTextInput from "./InteractiveAvatarTextInput";
import { useFaceRecognition } from "./useFaceRecognition";

import { AVATARS, STT_LANGUAGE_LIST } from "@/app/lib/constants";

interface InteractiveAvatarProps {
  fullScreenMode?: boolean;
  setFullScreenMode?: (mode: boolean) => void;
}

// 認識された顔の情報を格納する型
interface RecognizedFace {
  person: string;
  isChild: boolean;
  gender: string;
  lastGreetedTime: number;
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
  
  // 顔認識用とカメラ分析用に別々の参照を用意する
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const cameraAnalysisInterval = useRef<NodeJS.Timeout | null>(null);
  
  // 顔認識関連の新しい状態変数
  const [faceRecognitionEnabled, setFaceRecognitionEnabled] = useState(false);
  const [recognizedFaces, setRecognizedFaces] = useState<RecognizedFace[]>([]);
  const faceRecognitionInterval = useRef<NodeJS.Timeout | null>(null);
  const greetingCooldown = 60000; // 同じ人への挨拶のクールダウン（ミリ秒）
  const [isGreeting, setIsGreeting] = useState(false);
  const [faceRecognitionError, setFaceRecognitionError] = useState<string>("");
  // ビデオ要素を動的に作成するためのref
  const faceVideoContainerRef = useRef<HTMLDivElement>(null);

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
        setIsGreeting(false); // 発話終了時に挨拶中フラグをリセット
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

  // ビデオ要素を動的に作成する
  const createVideoElement = () => {
    console.log("ビデオ要素を動的に作成します");
    
    // 既存のビデオ要素をクリア
    if (faceVideoContainerRef.current) {
      faceVideoContainerRef.current.innerHTML = '';
      
      // 新しいビデオ要素を作成
      const videoElement = document.createElement('video');
      videoElement.id = 'face-recognition-video';
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.style.width = '100%';
      videoElement.style.height = 'auto';
      
      // コンテナに追加
      faceVideoContainerRef.current.appendChild(videoElement);
      
      // キャンバス要素も作成
      const canvasElement = document.createElement('canvas');
      canvasElement.id = 'face-recognition-canvas';
      canvasElement.style.display = 'none';
      faceVideoContainerRef.current.appendChild(canvasElement);
      
      console.log("ビデオ要素が作成されました:", videoElement);
      return { 
        videoElement,
        canvasElement
      };
    }
    
    console.log("ビデオコンテナがnullです");
    return null;
  };

  // 顔認識の切り替え関数
  const toggleFaceRecognition = () => {
    console.log("顔認識ボタンがクリックされました");
    setFaceRecognitionError(""); // エラーメッセージをクリア
    
    if (faceRecognitionEnabled) {
      console.log("顔認識を停止します");
      stopFaceRecognition();
    } else {
      console.log("顔認識を開始します");
      startFaceRecognition();
    }
  };

  // 顔認識を開始する関数
  const startFaceRecognition = async () => {
    console.log("startFaceRecognition関数が呼び出されました");
    try {
      // 既存の認識済み顔リストをクリア
      setRecognizedFaces([]);
      
      setDebug("カメラへのアクセスを要求中...");
      console.log("カメラへのアクセスを要求中...");

      // カメラへのアクセス許可を取得
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      console.log("カメラへのアクセスが許可されました");
      setDebug("カメラへのアクセスが許可されました");

      // ビデオ要素を動的に作成
      const elements = createVideoElement();
      if (!elements) {
        throw new Error("ビデオ要素を作成できませんでした");
      }
      
      const { videoElement, canvasElement } = elements;

      // ビデオ要素にストリームを設定
      videoElement.srcObject = stream;
      try {
        await videoElement.play();
        console.log("ビデオの再生を開始しました");
        
        setFaceRecognitionEnabled(true);
        setCameraEnabled(true);
        setDebug("顔認識を開始しました");
        console.log("顔認識を開始しました");

        // 5秒ごとに顔認識を実行
        console.log("顔認識インターバルを設定中...");
        faceRecognitionInterval.current = setInterval(() => {
          console.log("顔認識インターバルが実行されました");
          analyzeFace(videoElement, canvasElement);
        }, 5000);
        
        // 初回の顔認識を少し遅らせて実行（カメラが起動するまで待つ）
        console.log("初回の顔認識をスケジュール中...");
        setTimeout(() => {
          console.log("初回の顔認識を実行します");
          analyzeFace(videoElement, canvasElement);
        }, 2000);
      } catch (playError) {
        console.error("ビデオ再生エラー:", playError);
        throw new Error(`ビデオ再生エラー: ${playError instanceof Error ? playError.message : "不明なエラー"}`);
      }
    } catch (error) {
      console.error("カメラアクセスエラー:", error);
      setDebug(
        `カメラアクセスエラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
      setFaceRecognitionError(
        `カメラアクセスエラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    }
  };

  // 顔認識を停止する関数
  const stopFaceRecognition = () => {
    console.log("stopFaceRecognition関数が呼び出されました");
    if (faceVideoContainerRef.current) {
      console.log("カメラストリームを停止中...");
      const videoElement = document.getElementById('face-recognition-video') as HTMLVideoElement;
      if (videoElement && videoElement.srcObject) {
        const tracks = (videoElement.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
        videoElement.srcObject = null;
      }
    }

    // 分析インターバルをクリア
    if (faceRecognitionInterval.current) {
      console.log("顔認識インターバルをクリア中...");
      clearInterval(faceRecognitionInterval.current);
      faceRecognitionInterval.current = null;
    }

    setFaceRecognitionEnabled(false);
    setCameraEnabled(false);
    setDebug("顔認識を停止しました");
    console.log("顔認識を停止しました");
  };

  // 人物に挨拶する関数
  const greetPerson = async (person: string, isChild: boolean, gender: string) => {
    if (!avatar.current || isGreeting) return;

    try {
      setIsGreeting(true);
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
      setIsGreeting(false);
    }
  };

  // 顔を分析する関数
  const analyzeFace = async (videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) => {
    console.log("analyzeFace関数が呼び出されました");
    if (isAnalyzing || isGreeting) {
      console.log("分析をスキップします。条件:", {
        isAnalyzing,
        isGreeting
      });
      return;
    }

    try {
      setIsAnalyzing(true);
      console.log("顔分析を開始します");
      setDebug("顔を分析中...");
      
      const context = canvasElement.getContext("2d");
      if (context) {
        // ビデオフレームをキャンバスに描画
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        context.drawImage(videoElement, 0, 0);
        console.log("ビデオフレームをキャンバスに描画しました");

        // キャンバスから画像データを取得
        const imageData = canvasElement.toDataURL("image/jpeg", 0.7);
        console.log("画像データを取得しました");

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
        
        if (response.ok) {
          const result = await response.json();
          console.log("顔認識結果:", result);
          
          if (result.success) {
            if (result.person) {
              setDebug(`顔認識結果: ${result.person}さん (${result.confidence.toFixed(2)}% 確信度)`);
              console.log(`顔認識結果: ${result.person}さん (${result.confidence.toFixed(2)}% 確信度)`);
              
              // 既に認識した人か確認
              const now = Date.now();
              const existingFaceIndex = recognizedFaces.findIndex(
                face => face.person === result.person
              );
              
              if (existingFaceIndex >= 0) {
                // 既に認識した人の場合、最後の挨拶から一定時間経過していれば再度挨拶
                const lastGreeted = recognizedFaces[existingFaceIndex].lastGreetedTime;
                console.log(`既存の顔を再認識しました: ${result.person}、前回の挨拶から経過時間: ${now - lastGreeted}ms`);
                
                if (now - lastGreeted > greetingCooldown) {
                  // 挨拶クールダウン経過後
                  console.log(`クールダウン経過後なので再挨拶します: ${result.person}`);
                  const updatedFaces = [...recognizedFaces];
                  updatedFaces[existingFaceIndex] = {
                    ...updatedFaces[existingFaceIndex],
                    lastGreetedTime: now
                  };
                  setRecognizedFaces(updatedFaces);
                  
                  await greetPerson(result.person, result.isChild, result.gender);
                } else {
                  console.log(`クールダウン中なので挨拶をスキップします: ${result.person}`);
                  setDebug(`${result.person}さんは最近挨拶済みです（${Math.floor((now - lastGreeted) / 1000)}秒前）`);
                }
              } else {
                // 初めて認識した人の場合
                console.log(`新しい顔を認識しました: ${result.person}`);
                setRecognizedFaces([
                  ...recognizedFaces,
                  {
                    person: result.person,
                    isChild: result.isChild,
                    gender: result.gender,
                    lastGreetedTime: now
                  }
                ]);
                
                await greetPerson(result.person, result.isChild, result.gender);
              }
            } else {
              console.log("顔は検出されましたが、マッチする人物がいませんでした");
              setDebug("顔は検出されましたが、登録されている人物とマッチしませんでした");
            }
          } else {
            console.log(`顔分析エラー: ${result.message}`);
            setDebug(`顔分析エラー: ${result.message}`);
            setFaceRecognitionError(`顔分析エラー: ${result.message}`);
          }
        } else {
          const errorData = await response.json();
          console.error("APIエラーレスポンス:", errorData);
          throw new Error(errorData.error || "顔認識に失敗しました");
        }
      } else {
        console.error("Canvasコンテキストを取得できませんでした");
        setFaceRecognitionError("Canvasコンテキストを取得できませんでした");
      }
    } catch (error) {
      console.error("顔認識エラー:", error);
      setDebug(
        `顔認識エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
      setFaceRecognitionError(
        `顔認識エラー: ${error instanceof Error ? error.message : "不明なエラー"}`
      );
    } finally {
      setIsAnalyzing(false);
      console.log("顔分析処理を完了しました");
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
      // すべてのトラックを停止
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    // 分析インターバルをクリア
    if (cameraAnalysisInterval.current) {
      clearInterval(cameraAnalysisInterval.current);
      cameraAnalysisInterval.current = null;
    }

    setCameraEnabled(false);
    setDebug("カメラ分析を停止しました");
  };

  // コンポーネントのアンマウント時にカメラを停止
  useEffect(() => {
    return () => {
      stopCameraAnalysis();
      stopFaceRecognition();
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
              onClick={toggleFaceRecognition}
              className={`absolute bottom-8 left-24 p-4 rounded-full ${
                faceRecognitionEnabled ? "bg-purple-500" : "bg-gray-500"
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
                <circle cx="12" cy="8" r="5" />
                <path d="M20 21a8 8 0 1 0-16 0" />
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

            {/* エラーメッセージを表示 */}
            {faceRecognitionError && (
              <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-red-500 bg-opacity-80 text-white px-4 py-2 rounded-lg">
                {faceRecognitionError}
              </div>
            )}

            {/* 顔認識用カメラのプレビューとキャンバス */}
            {faceRecognitionEnabled && (
              <div className="absolute top-2 right-2 w-64 h-48 bg-black bg-opacity-50 rounded-lg overflow-hidden">
                <div ref={faceVideoContainerRef} className="w-full h-full">
                  <video
                    id="face-recognition-video"
                    className="w-full h-full"
                    playsInline
                    muted
                    autoPlay
                  />
                  <canvas
                    id="face-recognition-canvas"
                    style={{ display: "none" }}
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-sm p-1">
                  {isAnalyzing ? (
                    <span className="flex items-center">
                      <span className="inline-block w-3 h-3 mr-1 bg-red-500 rounded-full animate-pulse"></span>
                      顔分析中...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <span className="inline-block w-3 h-3 mr-1 bg-green-500 rounded-full"></span>
                      顔認識モード: オン
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 認識された人物リスト */}
            {faceRecognitionEnabled && recognizedFaces.length > 0 && (
              <div className="absolute top-2 left-2 bg-black bg-opacity-50 rounded-lg p-2 text-white">
                <h3 className="text-sm font-bold mb-1">認識された人物:</h3>
                <ul className="text-xs">
                  {recognizedFaces.map((face, index) => (
                    <li key={index} className="mb-1">
                      {face.person}さん ({face.isChild ? "子供" : "大人"}, {face.gender === "Male" ? "男性" : face.gender === "Female" ? "女性" : "不明"})
                    </li>
                  ))}
                </ul>
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

  // UIに追加する顔認識関連の要素
  const faceRecognitionControls = (
    <div className="mt-4 border-t pt-4">
      <h3 className="text-lg font-medium mb-2">顔認識</h3>
      <Button
        color={faceRecognitionEnabled ? "danger" : "success"}
        variant="flat"
        onClick={toggleFaceRecognition}
        className="w-full mb-2"
      >
        {faceRecognitionEnabled ? "顔認識を停止" : "顔認識を開始"}
      </Button>

      {faceRecognitionError && (
        <div className="mb-2 p-2 bg-red-100 text-red-800 rounded-lg text-sm">
          {faceRecognitionError}
        </div>
      )}

      {faceRecognitionEnabled && (
        <div className="relative">
          <div className="flex justify-between mb-2">
            <small className="text-gray-500">カメラプレビュー</small>
          </div>
          <div
            ref={faceVideoContainerRef}
            className="rounded-lg overflow-hidden border"
            style={{ maxWidth: "300px", margin: "0 auto" }}
          >
            <video
              id="face-recognition-video"
              className="w-full h-auto"
              playsInline
              muted
              autoPlay
            />
            <canvas
              id="face-recognition-canvas"
              style={{ display: "none" }}
            />
          </div>

          {recognizedFaces.length > 0 && (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <h4 className="text-sm font-medium mb-1">認識された人物:</h4>
              <ul className="text-xs">
                {recognizedFaces.map((face, index) => (
                  <li key={index} className="mb-1">
                    {face.person}さん ({face.isChild ? "子供" : "大人"}, {face.gender === "Male" ? "男性" : face.gender === "Female" ? "女性" : "不明"})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
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
          <Button
            color="primary"
            variant="flat"
            onClick={toggleMicrophone}
            isDisabled={!sessionId || isLoadingSession}
            className="w-full"
          >
            {isMicActive ? "マイクをオフにする" : "マイクをオンにする"}
          </Button>
          <Button
            color="secondary"
            variant="flat"
            onClick={playIntroMessage}
            isDisabled={!sessionId || isLoadingSession}
            className="w-full"
          >
            イントロメッセージを再生
          </Button>

          {/* 顔認識コントロールを追加 */}
          {faceRecognitionControls}

          {/* カメラコントロールを追加 */}
          {cameraControls}
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