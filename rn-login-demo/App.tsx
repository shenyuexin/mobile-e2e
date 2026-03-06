import React, { useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const DEMO_PHONE = '13800138000';
const DEMO_PASSWORD = '123456';

export default function App() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => phone.length > 0 && password.length > 0, [phone, password]);

  const onLogin = () => {
    if (phone === DEMO_PHONE && password === DEMO_PASSWORD) {
      setError('');
      setLoggedIn(true);
      return;
    }
    setError('账号或密码错误');
  };

  if (loggedIn) {
    return (
      <SafeAreaView style={styles.container} testID="home-screen">
        <View style={styles.card}>
          <Text style={styles.title}>Home</Text>
          <Text testID="welcome-home">欢迎进入首页</Text>
          <TouchableOpacity testID="logout-button" style={styles.button} onPress={() => setLoggedIn(false)}>
            <Text style={styles.buttonText}>退出登录</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} testID="login-screen">
      <View style={styles.card}>
        <Text style={styles.title}>登录</Text>

        <TextInput
          testID="phone-input"
          style={styles.input}
          placeholder="请输入手机号"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <TextInput
          testID="password-input"
          style={styles.input}
          placeholder="请输入密码"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error.length > 0 ? (
          <Text testID="login-error" style={styles.errorText}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          testID="login-button"
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          disabled={!canSubmit}
          onPress={onLogin}
        >
          <Text style={styles.buttonText}>登录</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>测试账号: {DEMO_PHONE}</Text>
        <Text style={styles.hint}>测试密码: {DEMO_PASSWORD}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#1976d2',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#90a4ae',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
  },
  hint: {
    color: '#607d8b',
    fontSize: 12,
  },
});
