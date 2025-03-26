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
  }, [initAudioContext]);

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
                      key={avatar.id}
                      value={avatar.id}
                      textValue={avatar.name}
                    >
                      {avatar.name}
                    </SelectItem>
                  ))}
                </Select>
                <p className="text-sm font-medium leading-none">
                  System prompt
                </p>
                <Input
                  placeholder="Enter a custom system prompt"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                />

                <p className="text-sm font-medium leading-none">LLM provider</p>
                <Select
                  placeholder="Select LLM provider"
                  aria-label="LLM provider selection"
                  size="md"
                  value={llmProvider}
                  onChange={(e) => {
                    setLlmProvider(e.target.value);
                  }}
                >
                  <SelectItem key="openai" value="openai" textValue="OpenAI">
                    OpenAI
                  </SelectItem>
                  <SelectItem key="azure" value="azure" textValue="Azure">
                    Azure
                  </SelectItem>
                  <SelectItem
                    key="google"
                    value="google"
                    textValue="Google Cloud PaLM"
                  >
                    Google Cloud PaLM
                  </SelectItem>
                </Select>

                <p className="text-sm font-medium leading-none">LLM model</p>
                <Select
                  placeholder="Select LLM model"
                  aria-label="LLM model selection"
                  size="md"
                  value={llmModel}
                  onChange={(e) => {
                    setLlmModel(e.target.value);
                  }}
                >
                  <SelectItem key="gpt-4" value="gpt-4" textValue="GPT-4">
                    GPT-4
                  </SelectItem>
                  <SelectItem
                    key="gpt-3.5-turbo"
                    value="gpt-3.5-turbo"
                    textValue="GPT-3.5 Turbo"
                  >
                    GPT-3.5 Turbo
                  </SelectItem>
                  <SelectItem
                    key="text-bison@001"
                    value="text-bison@001"
                    textValue="PaLM 2 (Text Bison)"
                  >
                    PaLM 2 (Text Bison)
                  </SelectItem>
                </Select>

                <p className="text-sm font-medium leading-none">Language</p>
                <Select
                  placeholder="Select language"
                  aria-label="Language selection"
                  size="md"
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                  }}
                >
                  {STT_LANGUAGE_LIST.map((lang) => (
                    <SelectItem
                      key={lang.code}
                      value={lang.code}
                      textValue={lang.name}
                    >
                      {lang.name}
                    </SelectItem>
                  ))}
                </Select>

                {/* 顔認識機能を有効化するボタン */}
                <p className="text-sm font-medium leading-none mt-3 flex items-center">
                  <span>顔認識機能</span>
                  <Badge 
                    className="ml-2" 
                    color="primary" 
                    variant="flat"
                    size="sm"
                  >
                    新機能
                  </Badge>
                </p>
                <Button
                  color={faceRecognitionEnabled ? "danger" : "success"}
                  variant="flat"
                  onClick={toggleFaceRecognition}
                  className="w-full mt-1"
                  startContent={
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      width="16" 
                      height="16" 
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
                  }
                >
                  {faceRecognitionEnabled ? "顔認識を停止" : "顔認識を開始"}
                </Button>
                <Tooltip 
                  content="カメラを使って、映っている人の顔を認識し名前で挨拶します。public/reference-faces/ に「名前.jpg」形式の画像を保存しておく必要があります。"
                  placement="bottom"
                >
                  <div className="text-xs text-gray-500 text-center cursor-help mt-1">
                    顔認識の詳細を確認 ℹ️
                  </div>
                </Tooltip>
              </div>

              <Button
                className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
                size="lg"
                isLoading={isLoadingSession}
                onPress={startSession}
              >
                Start Session
              </Button>

              {debug && <div className="text-xs max-w-full">{debug}</div>}
            </div>
          ) : (
            <div className="h-[500px] w-[900px] justify-center items-center flex">
              <Spinner color="primary" size="lg" label="Loading..." />
            </div>
          )}
        </CardBody>
        {stream && (
          <CardFooter className="flex-col gap-2">
            <Divider />
            <div className="flex flex-col md:flex-row w-full items-center">
              <div className="w-full md:w-[300px] h-fit flex gap-3 px-2">
                <Button
                  onPress={handleSpeak}
                  isLoading={isLoadingRepeat}
                  className="flex-grow"
                  isDisabled={!text || !stream}
                  color="primary"
                >
                  Speak this
                </Button>
                <Button
                  isIconOnly
                  onPress={toggleMicrophone}
                  className={isMicActive ? "text-red-500" : ""}
                  isDisabled={!stream}
                >
                  <svg
                    fill="none"
                    height="24"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                    width="24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 18.75a6 6 0 0 0 6-6V6.75a6 6 0 1 0-12 0v6a6 6 0 0 0 6 6Z"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5.636 18.75H18.5"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 18.75v4.5"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
                <Button
                  onPress={toggleSettings}
                  isIconOnly
                  className={isMicActive ? "text-red-500" : ""}
                  isDisabled={!stream}
                >
                  <svg
                    fill="none"
                    height="24"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M20 7l-8-4-8 4" />
                    <path d="M4 7v5a8 8 0 0 0 16 0V7" />
                    <path d="M7 15l5 5 5-5" />
                  </svg>
                </Button>
              </div>

              <Divider
                orientation={
                  typeof window !== "undefined" && window.innerWidth < 768
                    ? "horizontal"
                    : "vertical"
                }
                className="mx-3 h-14 hidden md:block"
              />

              <div className="flex-grow">
                <InteractiveAvatarTextInput
                  isDisabled={!stream || isLoadingRepeat}
                  value={text}
                  onChange={setText}
                />
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* 拡張モードでの詳細設定 */}
      {showSettings && (
        <Card className="w-full flex flex-col gap-4">
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium leading-none">Knowledge ID</p>
              <Input
                placeholder="Enter a custom knowledge ID"
                value={knowledgeId}
                onChange={(e) => setKnowledgeId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium leading-none">Avatar ID</p>
              <Input
                placeholder="Enter a custom avatar ID"
                value={avatarId}
                onChange={(e) => setAvatarId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium leading-none">System Prompt</p>
              <Input
                placeholder="Enter a custom system prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium leading-none">LLM Provider</p>
              <Select
                placeholder="Select LLM provider"
                aria-label="LLM provider selection"
                size="md"
                value={llmProvider}
                onChange={(e) => {
                  setLlmProvider(e.target.value);
                }}
              >
                <SelectItem key="openai" value="openai" textValue="OpenAI">
                  OpenAI
                </SelectItem>
                <SelectItem key="azure" value="azure" textValue="Azure">
                  Azure
                </SelectItem>
                <SelectItem
                  key="google"
                  value="google"
                  textValue="Google Cloud PaLM"
                >
                  Google Cloud PaLM
                </SelectItem>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium leading-none">LLM Model</p>
              <Select
                placeholder="Select LLM model"
                aria-label="LLM model selection"
                size="md"
                value={llmModel}
                onChange={(e) => {
                  setLlmModel(e.target.value);
                }}
              >
                <SelectItem key="gpt-4" value="gpt-4" textValue="GPT-4">
                  GPT-4
                </SelectItem>
                <SelectItem
                  key="gpt-3.5-turbo"
                  value="gpt-3.5-turbo"
                  textValue="GPT-3.5 Turbo"
                >
                  GPT-3.5 Turbo
                </SelectItem>
                <SelectItem
                  key="text-bison@001"
                  value="text-bison@001"
                  textValue="PaLM 2 (Text Bison)"
                >
                  PaLM 2 (Text Bison)
                </SelectItem>
              </Select>
            </div>
            <Button
              className="bg-gradient-to-tr from-indigo-500 to-indigo-300 text-white rounded-lg"
              size="lg"
              isLoading={isLoadingSession}
              onPress={saveSettings}
            >
              Save Settings & Restart
            </Button>
          </CardBody>
        </Card>
      )}

      {/* 顔認識UIの表示 */}
      {faceRecognitionUI}

      {/* カメラ分析コントロールの表示（必要に応じて） */}
      {false && cameraControls /* 必要な場合にtrueに変更 */}
    </div>
  );
}