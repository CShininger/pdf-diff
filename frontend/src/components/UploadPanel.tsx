import { useRef, useState } from "react";
import { uploadFile } from "../api/upload";

interface UploadPanelProps {
  apiBase: string;
  loading: boolean;
  onCompare: (
    templateUrl: string,
    contractUrl: string,
    templateName: string,
    contractName: string,
  ) => void;
}

export function UploadPanel({ apiBase, loading, onCompare }: UploadPanelProps) {
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const templateRef = useRef<HTMLInputElement>(null);
  const contractRef = useRef<HTMLInputElement>(null);

  const busy = loading || uploading;
  const canSubmit = templateFile && contractFile && !busy;

  const handleCompare = async () => {
    if (!templateFile || !contractFile) {
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const [templateUpload, contractUpload] = await Promise.all([
        uploadFile(templateFile, apiBase),
        uploadFile(contractFile, apiBase),
      ]);
      onCompare(
        templateUpload.url,
        contractUpload.url,
        templateFile.name,
        contractFile.name,
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="upload-panel">
      <div className="upload-grid">
        <label className="upload-card">
          <span className="upload-label">模版 PDF（招标文件）</span>
          <input
            ref={templateRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setTemplateFile(e.target.files?.[0] ?? null)}
          />
          <span className="upload-filename">
            {templateFile?.name ?? "点击选择文件"}
          </span>
        </label>

        <label className="upload-card">
          <span className="upload-label">正式 PDF（业主合同）</span>
          <input
            ref={contractRef}
            type="file"
            accept="application/pdf"
            onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
          />
          <span className="upload-filename">
            {contractFile?.name ?? "点击选择文件"}
          </span>
        </label>
      </div>

      <button
        type="button"
        className="primary-btn"
        disabled={!canSubmit}
        onClick={() => void handleCompare()}
      >
        {uploading ? "上传中…" : loading ? "比对中…" : "开始比对"}
      </button>
      {uploadError && <div className="error-banner">{uploadError}</div>}
    </section>
  );
}
