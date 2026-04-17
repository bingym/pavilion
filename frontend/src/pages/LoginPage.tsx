import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Form, Input, Typography, message } from "antd";
import { BookOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { login, TOKEN_KEY } from "../api/client";

const { Title } = Typography;

interface LoginForm {
  username: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const res = await login(values.username, values.password);
      localStorage.setItem(TOKEN_KEY, res.data.token);
      message.success("login success");
      navigate("/", { replace: true });
    } catch {
      message.error("username or password is incorrect");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      }}
    >
      <Card
        style={{
          width: 400,
          borderRadius: 16,
        }}
        styles={{ body: { padding: "40px 40px 32px" } }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <BookOutlined style={{ fontSize: 48, color: "#6366f1" }} />
          <Title level={2} style={{ margin: "12px 0 4px", color: "#1e1b4b" }}>
            Pavilion
          </Title>
        </div>

        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: "enter username" }]}
          >
            <Input prefix={<UserOutlined />} placeholder="username" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: "enter password" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 44,
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
              }}
            >
              Login
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
