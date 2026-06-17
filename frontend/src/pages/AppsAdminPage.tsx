import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Form,
  Input,
  Layout,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
  message,
} from "antd";
import BookOutlined from "@ant-design/icons/es/icons/BookOutlined";
import ApiOutlined from "@ant-design/icons/es/icons/ApiOutlined";
import PlusOutlined from "@ant-design/icons/es/icons/PlusOutlined";
import KeyOutlined from "@ant-design/icons/es/icons/KeyOutlined";
import DeleteOutlined from "@ant-design/icons/es/icons/DeleteOutlined";
import type { AdminApp } from "../api/client";
import {
  createAdminApp,
  createAppToken,
  deleteAdminApp,
  deleteAppToken,
  listAdminApps,
} from "../api/client";

const { Header, Content } = Layout;
const { Title } = Typography;

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AppsAdminPage() {
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [revealedToken, setRevealedToken] = useState("");
  const [form] = Form.useForm<{ name: string }>();

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminApps();
      setApps(res.data.list);
    } catch {
      message.error("Failed to load app list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchApps();
  }, [fetchApps]);

  const submitCreate = async () => {
    try {
      const v = await form.validateFields();
      setCreateSubmitting(true);
      await createAdminApp(v.name.trim());
      message.success("App created successfully");
      setCreateOpen(false);
      form.resetFields();
      void fetchApps();
    } catch (e) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      message.error("Failed to create app");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const issueToken = async (appId: number) => {
    try {
      const res = await createAppToken(appId);
      setRevealedToken(res.data.token);
      setTokenModalOpen(true);
      void fetchApps();
    } catch {
      message.error("Failed to generate token");
    }
  };

  const revokeToken = async (appId: number) => {
    try {
      await deleteAppToken(appId);
      message.success("Token deleted successfully");
      void fetchApps();
    } catch {
      message.error("Failed to delete token");
    }
  };

  const removeApp = async (appId: number) => {
    try {
      await deleteAdminApp(appId);
      message.success("App deleted successfully");
      void fetchApps();
    } catch {
      message.error("Failed to delete app");
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(revealedToken);
      message.success("Copied to clipboard");
    } catch {
      message.error("Failed to copy");
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 72 },
    { title: "Name", dataIndex: "name", ellipsis: true },
    {
      title: "Created At",
      dataIndex: "created_at",
      width: 180,
      render: (t: number) => formatDate(t),
    },
    {
      title: "API Key",
      width: 200,
      render: (_: unknown, r: AdminApp) =>
        r.hasToken ? (
          <span style={{ color: "#52c41a" }}>Configured</span>
        ) : (
          <span style={{ color: "#999" }}>Not configured</span>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 500,
      render: (_: unknown, r: AdminApp) => (
        <Space wrap size="small">
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => void issueToken(r.id)}
          >
            {r.hasToken ? "Rotate Token" : "Generate Token"}
          </Button>
          <Popconfirm
            title="Are you sure to delete the token? The original key will be invalidated immediately."
            onConfirm={() => void revokeToken(r.id)}
            okText="OK"
            cancelText="Cancel"
            disabled={!r.hasToken}
          >
            <Button type="link" size="small" danger disabled={!r.hasToken}>
              Delete Token
            </Button>
          </Popconfirm>
          <Popconfirm
            title="Are you sure to delete the app? The associated token will be invalidated."
            onConfirm={() => void removeApp(r.id)}
            okText="OK"
            cancelText="Cancel"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete App
            </Button>
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
          <ApiOutlined style={{ fontSize: 24, color: "#fff" }} />
          <Title level={4} style={{ color: "#fff", margin: 0 }}>
            App Management
          </Title>
        </Space>
        <Space>
          <Link to="/">
            <Button
              icon={<BookOutlined />}
              style={{
                color: "#fff",
                borderColor: "rgba(255,255,255,0.5)",
                background: "transparent",
              }}
            >
              Book Library
            </Button>
          </Link>

        </Space>
      </Header>

      <Content style={{ padding: "24px" }}>
        <Card
          style={{ borderRadius: 12 }}
          title={
            <Space>
              <ApiOutlined />
              <span>Third-party Apps</span>
            </Space>
          }
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              style={{
                background:
                  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                border: "none",
              }}
            >
              New App
            </Button>
          }
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={apps}
            loading={loading}
            pagination={false}
          />
        </Card>
      </Content>

      <Modal
        title="New App"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        onOk={() => void submitCreate()}
        confirmLoading={createSubmitting}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter the name" }]}
          >
            <Input placeholder="App Name" maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Please save the Token"
        open={tokenModalOpen}
        onCancel={() => {
          setTokenModalOpen(false);
          setRevealedToken("");
        }}
        footer={[
          <Button key="copy" type="primary" onClick={() => void copyToken()}>
            Copy
          </Button>,
          <Button
            key="close"
            onClick={() => {
              setTokenModalOpen(false);
              setRevealedToken("");
            }}
          >
            Saved
          </Button>,
        ]}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          This key is only displayed once, please save it properly. When requesting business API, use the following in the Header:
          <code> Authorization: Bearer &lt;token&gt; </code>
        </Typography.Paragraph>
        <Input.TextArea
          readOnly
          autoSize={{ minRows: 2, maxRows: 4 }}
          value={revealedToken}
          style={{ fontFamily: "monospace", fontSize: 13 }}
        />
      </Modal>
    </Layout>
  );
}
