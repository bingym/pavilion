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

const STEPS = ["Select File", "Calculate Hash", "Check Duplicate", "Upload File", "Save Record"];

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
    if (result) {
      onSuccess(result);
    }
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
      setErrorMsg(`Unsupported file format: ${ext}, only supports epub/mobi/pdf`);
      setRunning(false);
      return;
    }

    try {
      // Step 1 → Completed (File selected)
      updateStep(0, "finish");

      // Step 2: Calculate SHA-256
      setActiveStep(1);
      updateStep(1, "process", "Calculating...");
      const hash = await computeSha256(selectedFile);
      updateStep(1, "finish", hash.slice(0, 16) + "...");

      if (abortRef.current) return;

      // Step 3: Check if file already exists
      setActiveStep(2);
      updateStep(2, "process", "Checking...");
      const checkRes = await checkFile(hash);
      if (checkRes.data.exists) {
        updateStep(2, "finish", "File already exists, skipping upload");
        setActiveStep(4);
        updateStep(3, "finish", "Skipped");
        updateStep(4, "finish", "Already exists");
        setResult(checkRes.data.book!);
        setRunning(false);
        return;
      }
      updateStep(2, "finish", "File does not exist, skipping upload");

      if (abortRef.current) return;

      // Step 4: Get upload credentials and upload
      setActiveStep(3);
      updateStep(3, "process", "Getting upload credentials...");
      const presignRes = await presignUpload(hash, selectedFile);
      const { uploadUrl, contentType } = presignRes.data;

      updateStep(3, "process", "Uploading...");
      setUploadProgress(0);
      await directUpload(uploadUrl, selectedFile, contentType, (p) => {
        setUploadProgress(p);
      });
      updateStep(3, "finish", "Upload completed");

      if (abortRef.current) return;

      // Step 5: Save record
      setActiveStep(4);
      updateStep(4, "process", "Saving record...");
      const completeRes = await completeUpload({
        hash,
        filename: selectedFile.name,
      });
      updateStep(4, "finish", "Saved");
      setResult(completeRes.data.book);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { error?: string } } })?.response
              ?.data?.error ?? "Upload failed";
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
      title="Upload E-Book"
      footer={
        result ? (
          <Button type="primary" onClick={handleClose}>
            Complete
          </Button>
        ) : (
          <Button onClick={handleClose} disabled={running}>
            Cancel
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
            <p className="ant-upload-text">Click or drag files to this area to upload</p>
            <p className="ant-upload-hint">Supports epub, mobi, pdf formats</p>
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
                message="Upload failed"
                description={errorMsg}
                showIcon
                action={
                  <Button size="small" onClick={reset}>
                    Retry
                  </Button>
                }
              />
            )}

            {result && (
              <Alert
                type="success"
                message="Upload successful"
                description={
                  <Space direction="vertical" size={2}>
                    <Text>
                      Title: <strong>{result.name}</strong>
                    </Text>
                    <Text>
                      Format:
                      <Tag color="blue">{result.file_type_label}</Tag>
                    </Text>
                    <Text>
                      Size: {(result.file_size / 1024 / 1024).toFixed(2)} MB
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
