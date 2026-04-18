import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Layout,
  Table,
  Tag,
  Typography,
  Space,
  Popconfirm,
  message,
  Tooltip,
  Statistic,
  Row,
  Col,
  Card,
  Input,
  Select,
  Modal,
  Form,
  Spin,
} from "antd";
import type { TablePaginationConfig } from "antd";
import BookOutlined from "@ant-design/icons/es/icons/BookOutlined";
import DeleteOutlined from "@ant-design/icons/es/icons/DeleteOutlined";
import LogoutOutlined from "@ant-design/icons/es/icons/LogoutOutlined";
import UploadOutlined from "@ant-design/icons/es/icons/UploadOutlined";
import ReloadOutlined from "@ant-design/icons/es/icons/ReloadOutlined";
import DownloadOutlined from "@ant-design/icons/es/icons/DownloadOutlined";
import EditOutlined from "@ant-design/icons/es/icons/EditOutlined";
import type { Book } from "../api/client";
import {
  getBooks,
  deleteBook,
  getBookDownloadPresign,
  patchBookName,
  TOKEN_KEY,
} from "../api/client";
import UploadModal from "../components/UploadModal";

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const FILE_TYPE_COLOR: Record<string, string> = {
  epub: "blue",
  mobi: "green",
  pdf: "red",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BooksPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20 });
  const [fileTypeFilter, setFileTypeFilter] = useState<number | undefined>(
    undefined
  );
  const [nameSearchInput, setNameSearchInput] = useState("");
  const [nameSearchApplied, setNameSearchApplied] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renamingBook, setRenamingBook] = useState<Book | null>(null);
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [form] = Form.useForm<{ name: string }>();
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadBook, setDownloadBook] = useState<Book | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadFilename, setDownloadFilename] = useState("");
  const [downloadLoading, setDownloadLoading] = useState(false);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBooks(pagination.page, pagination.pageSize, {
        fileType: fileTypeFilter,
        name: nameSearchApplied || undefined,
      });
      setBooks(res.data.list);
      setTotal(res.data.total);
    } catch {
      message.error("failed to get books list");
    } finally {
      setLoading(false);
    }
  }, [pagination, fileTypeFilter, nameSearchApplied]);

  useEffect(() => {
    void fetchBooks();
  }, [fetchBooks]);

  const handleDelete = async (id: number) => {
    try {
      await deleteBook(id);
      message.success("delete success");
      void fetchBooks();
    } catch {
      message.error("delete failed");
    }
  };

  const handleTableChange = (pag: TablePaginationConfig) => {
    setPagination({
      page: pag.current ?? 1,
      pageSize: pag.pageSize ?? 20,
    });
  };

  const applyNameSearch = () => {
    setNameSearchApplied(nameSearchInput.trim());
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const resetFilters = () => {
    setFileTypeFilter(undefined);
    setNameSearchInput("");
    setNameSearchApplied("");
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const handleFileTypeChange = (value: number | undefined) => {
    setFileTypeFilter(value);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const openDownloadModal = async (record: Book) => {
    setDownloadBook(record);
    setDownloadUrl("");
    setDownloadFilename("");
    setDownloadOpen(true);
    setDownloadLoading(true);
    try {
      const res = await getBookDownloadPresign(record.id);
      setDownloadUrl(res.data.downloadUrl);
      setDownloadFilename(res.data.filename);
    } catch {
      message.error("failed to get download link");
      setDownloadOpen(false);
      setDownloadBook(null);
    } finally {
      setDownloadLoading(false);
    }
  };

  const closeDownloadModal = () => {
    setDownloadOpen(false);
    setDownloadBook(null);
    setDownloadUrl("");
    setDownloadFilename("");
  };

  const startBrowserDownload = () => {
    if (!downloadUrl) return;
    window.location.href = downloadUrl;
  };

  const openRename = (record: Book) => {
    setRenamingBook(record);
    form.setFieldsValue({ name: record.name });
    setRenameOpen(true);
  };

  const submitRename = async () => {
    if (!renamingBook) return;
    try {
      const v = await form.validateFields();
      setRenameSubmitting(true);
      await patchBookName(renamingBook.id, v.name.trim());
      message.success("renamed");
      setRenameOpen(false);
      setRenamingBook(null);
      void fetchBooks();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error("rename failed");
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    navigate("/login", { replace: true });
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (name: string) => (
        <Space>
          <BookOutlined style={{ color: "#6366f1" }} />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: "Format",
      dataIndex: "file_type_label",
      key: "file_type_label",
      width: 80,
      render: (label: string) => (
        <Tag color={FILE_TYPE_COLOR[label] ?? "default"}>
          {label.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Size",
      dataIndex: "file_size",
      key: "file_size",
      width: 100,
      render: (size: number) => (
        <Text type="secondary">{formatBytes(size)}</Text>
      ),
    },
    {
      title: "SHA256",
      dataIndex: "hash",
      key: "hash",
      width: 140,
      render: (hash: string) => (
        <Tooltip title={hash}>
          <Text code style={{ fontSize: 12 }}>
            {hash.slice(0, 12)}...
          </Text>
        </Tooltip>
      ),
    },
    {
      title: "Upload Time",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (ts: number) => (
        <Text type="secondary">{formatDate(ts)}</Text>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 140,
      render: (_: unknown, record: Book) => (
        <Space size="small">
          <Tooltip title="Download Link">
            <Button
              type="text"
              icon={<DownloadOutlined />}
              size="small"
              onClick={() => void openDownloadModal(record)}
            />
          </Tooltip>
          <Tooltip title="Rename">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={() => openRename(record)}
            />
          </Tooltip>
          <Popconfirm
            title="confirm delete"
            description={`will delete file "${record.name}" and cannot be recovered`}
            onConfirm={() => handleDelete(record.id)}
            okText="confirm delete"
            okButtonProps={{ danger: true }}
            cancelText="cancel"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <Header
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <Space>
          <BookOutlined style={{ fontSize: 24, color: "#fff" }} />
          <Title level={4} style={{ color: "#fff", margin: 0 }}>
            Pavilion
          </Title>
        </Space>
        <Button
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          style={{
            color: "#fff",
            borderColor: "rgba(255,255,255,0.5)",
            background: "transparent",
          }}
        >
          Logout
        </Button>
      </Header>

      <Content style={{ padding: "24px" }}>
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card
              style={{ borderRadius: 12}}
            >
              <Statistic
                title="Total Books"
                value={total}
                prefix={<BookOutlined />}
                valueStyle={{ color: "#6366f1" }}
              />
            </Card>
          </Col>
        </Row>

        <Card
          style={{
            borderRadius: 12,
          }}
          title={
            <Space>
              <BookOutlined />
              <span>Books List</span>
            </Space>
          }
          extra={
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void fetchBooks()}
                loading={loading}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={() => setUploadOpen(true)}
                style={{
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  border: "none",
                }}
              >
                Upload Book
              </Button>
            </Space>
          }
        >
          <Space
            wrap
            style={{ marginBottom: 16, width: "100%" }}
            align="center"
          >
            <Select
              placeholder="File type"
              allowClear
              style={{ width: 140 }}
              value={fileTypeFilter}
              onChange={handleFileTypeChange}
              options={[
                { value: 1, label: "EPUB" },
                { value: 2, label: "MOBI" },
                { value: 3, label: "PDF" },
              ]}
            />
            <Input.Search
              placeholder="Search by name (fuzzy)"
              allowClear
              style={{ maxWidth: 280 }}
              value={nameSearchInput}
              onChange={(e) => setNameSearchInput(e.target.value)}
              onSearch={() => applyNameSearch()}
            />
            <Button onClick={resetFilters}>Reset filters</Button>
          </Space>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={books}
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: pagination.page,
              pageSize: pagination.pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `Total ${t} books`,
              pageSizeOptions: ["10", "20", "50", "100"],
            }}
          />
        </Card>
      </Content>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={() => {
          setUploadOpen(false);
          void fetchBooks();
        }}
      />

      <Modal
        title="Download Link"
        open={downloadOpen}
        onCancel={closeDownloadModal}
        footer={
          <Button key="close" onClick={closeDownloadModal}>
            Close
          </Button>
        }
        width={640}
        destroyOnHidden
      >
        {downloadLoading ? (
          <div style={{ padding: "24px 0", textAlign: "center" }}>
            <Spin tip="Generating link..." />
          </div>
        ) : (
          <>
            {downloadBook && (
              <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                {downloadBook.name}
                {downloadFilename ? ` · Save as ${downloadFilename}` : ""}
              </Text>
            )}
            <Paragraph
              copyable={
                downloadUrl
                  ? {
                      text: downloadUrl,
                      tooltips: ["Copy link", "Copied"],
                    }
                  : false
              }
              style={{ marginBottom: 16, wordBreak: "break-all" }}
            >
              {downloadUrl || "—"}
            </Paragraph>
            <Space wrap>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                disabled={!downloadUrl}
                onClick={startBrowserDownload}
              >
                Download
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Link is valid for about 10 minutes; you can also copy the link above
              </Text>
            </Space>
          </>
        )}
      </Modal>

      <Modal
        title="Rename"
        open={renameOpen}
        onCancel={() => {
          setRenameOpen(false);
          setRenamingBook(null);
        }}
        onOk={() => void submitRename()}
        confirmLoading={renameSubmitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Display name"
            rules={[
              { required: true, message: "Please enter a name" },
              { max: 500, message: "Max 500 characters" },
            ]}
          >
            <Input placeholder="File name without extension" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
