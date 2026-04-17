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
} from "antd";
import type { TablePaginationConfig } from "antd";
import BookOutlined from "@ant-design/icons/es/icons/BookOutlined";
import DeleteOutlined from "@ant-design/icons/es/icons/DeleteOutlined";
import LogoutOutlined from "@ant-design/icons/es/icons/LogoutOutlined";
import UploadOutlined from "@ant-design/icons/es/icons/UploadOutlined";
import ReloadOutlined from "@ant-design/icons/es/icons/ReloadOutlined";
import type { Book } from "../api/client";
import { getBooks, deleteBook, TOKEN_KEY } from "../api/client";
import UploadModal from "../components/UploadModal";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

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

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBooks(pagination.page, pagination.pageSize);
      setBooks(res.data.list);
      setTotal(res.data.total);
    } catch {
      message.error("failed to get books list");
    } finally {
      setLoading(false);
    }
  }, [pagination]);

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
      width: 80,
      render: (_: unknown, record: Book) => (
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
    </Layout>
  );
}
