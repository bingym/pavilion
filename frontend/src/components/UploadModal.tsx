import { useState, useRef } from "react";
import {
  Modal,
  Steps,
  Upload,
  Button,
  Progress,
  Alert,
  Typography,
  Space,
  Tag,
} from "antd";
import InboxOutlined from "@ant-design/icons/es/icons/InboxOutlined";
import CheckCircleOutlined from "@ant-design/icons/es/icons/CheckCircleOutlined";
import LoadingOutlined from "@ant-design/icons/es/icons/LoadingOutlined";
import type { UploadFile } from "antd";
import {
  computeSha256,
  checkFile,
  presignUpload,
  directUpload,
  completeUpload,
  FILE_TYPE_MAP,
} from "../api/client";
import type { Book } from "../api/client";

const { Text } = Typography;
const { Dragger } = Upload;

type StepStatus = "wait" | "process" | "finish" | "error";

interface StepState {
  status: StepStatus;
  description?: string;
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (book: Book) => void;
}

const STEPS = ["选择文件", "计算哈希", "检查重复", "上传文件", "保存记录"];

export default function UploadModal({
  open,
  onClose,
  onSuccess,
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(
    STEPS.map(() => ({ status: "wait" as StepStatus }))
  );
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<Book | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef(false);
  const currentStepRef = useRef(0);

  const updateStep = (
    index: number,
    status: StepStatus,
    description?: string
  ) => {
    setStepStates((prev) => {
      const next = [...prev];
      next[index] = { status, description };
      return next;
    });
  };

  const setActiveStep = (index: number) => {
    currentStepRef.current = index;
    setCurrentStep(index);
  };

  const reset = () => {
    setFile(null);
    setCurrentStep(0);
    currentStepRef.current = 0;
    setStepStates(STEPS.map(() => ({ status: "wait" })));
    setUploadProgress(0);
    setErrorMsg(null);
    setResult(null);
    setRunning(false);
    abortRef.current = false;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const startUpload = async (selectedFile: File) => {
    setRunning(true);
    setErrorMsg(null);
    abortRef.current = false;

    const ext = selectedFile.name.split(".").pop()?.toLowerCase() ?? "";
    const fileType = FILE_TYPE_MAP[ext];
    if (!fileType) {
      setErrorMsg(`不支持的文件格式：${ext}，仅支持 epub/mobi/pdf`);
      setRunning(false);
      return;
    }

    try {
      // Step 1 → 已完成（文件已选择）
      updateStep(0, "finish");

      // Step 2: 计算 SHA-256
      setActiveStep(1);
      updateStep(1, "process", "计算中...");
      const hash = await computeSha256(selectedFile);
      updateStep(1, "finish", hash.slice(0, 16) + "...");

      if (abortRef.current) return;

      // Step 3: 检查是否已存在
      setActiveStep(2);
      updateStep(2, "process", "查询中...");
      const checkRes = await checkFile(hash);
      if (checkRes.data.exists) {
        updateStep(2, "finish", "文件已存在，跳过上传");
        setActiveStep(4);
        updateStep(3, "finish", "已跳过");
        updateStep(4, "finish", "已存在");
        setResult(checkRes.data.book!);
        setRunning(false);
        return;
      }
      updateStep(2, "finish", "文件不存在，继续上传");

      if (abortRef.current) return;

      // Step 4: 获取上传凭证并上传
      setActiveStep(3);
      updateStep(3, "process", "获取上传凭证...");
      const presignRes = await presignUpload(hash, selectedFile);
      const { uploadUrl, contentType } = presignRes.data;

      updateStep(3, "process", "上传中...");
      setUploadProgress(0);
      await directUpload(uploadUrl, selectedFile, contentType, (p) => {
        setUploadProgress(p);
      });
      updateStep(3, "finish", "上传完成");

      if (abortRef.current) return;

      // Step 5: 保存记录
      setActiveStep(4);
      updateStep(4, "process", "保存记录...");
      const completeRes = await completeUpload({
        hash,
        filename: selectedFile.name,
      });
      updateStep(4, "finish", "已保存");
      setResult(completeRes.data.book);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { error?: string } } })?.response
              ?.data?.error ?? "上传失败";
      setErrorMsg(msg);
      const failStep = currentStepRef.current;
      updateStep(failStep, "error", msg);
    } finally {
      setRunning(false);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    updateStep(0, "finish", selectedFile.name);
    startUpload(selectedFile);
    return false;
  };

  const stepsItems = STEPS.map((title, i) => {
    const s = stepStates[i];
    let icon: React.ReactNode = undefined;
    if (s.status === "process") icon = <LoadingOutlined />;
    if (s.status === "finish") icon = <CheckCircleOutlined />;
    return {
      title,
      status: s.status,
      description: s.description,
      icon,
    };
  });

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title="上传电子书"
      footer={
        result ? (
          <Button
            type="primary"
            onClick={() => {
              onSuccess(result);
              handleClose();
            }}
          >
            完成
          </Button>
        ) : (
          <Button onClick={handleClose} disabled={running}>
            取消
          </Button>
        )
      }
      width={600}
      maskClosable={!running}
    >
      <Space direction="vertical" style={{ width: "100%" }} size="large">
        {!file && (
          <Dragger
            multiple={false}
            accept=".epub,.mobi,.pdf"
            showUploadList={false}
            beforeUpload={(f: UploadFile) => {
              handleFileSelect(f as unknown as File);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">支持 epub、mobi、pdf 格式</p>
          </Dragger>
        )}

        {file && (
          <>
            <Steps
              current={currentStep}
              direction="vertical"
              size="small"
              items={stepsItems}
              style={{ marginTop: 8 }}
            />

            {running && currentStep === 3 && (
              <Progress percent={uploadProgress} status="active" />
            )}

            {errorMsg && (
              <Alert
                type="error"
                message="上传失败"
                description={errorMsg}
                showIcon
                action={
                  <Button size="small" onClick={reset}>
                    重试
                  </Button>
                }
              />
            )}

            {result && (
              <Alert
                type="success"
                message="上传成功"
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      书名：<strong>{result.name}</strong>
                    </Text>
                    <Text>
                      格式：
                      <Tag color="blue">{result.file_type_label}</Tag>
                    </Text>
                    <Text>
                      大小：{(result.file_size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  </Space>
                }
                showIcon
              />
            )}
          </>
        )}
      </Space>
    </Modal>
  );
}
