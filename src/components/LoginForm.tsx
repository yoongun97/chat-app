'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');

  // 에러 상태
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  // 입력 여부 체크
  const checkEmpty = (value: string, setError: (msg: string) => void, fieldName: string) => {
    if (!value) {
      setError(`${fieldName}을(를) 입력해주세요.`);
      return false;
    }
    return true;
  };

  // 이메일 유효성 검사
  const validateEmail = (email: string) => {
    if (!email) return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('올바른 이메일 형식이 아닙니다.');
      return false;
    }
    return true;
  };

  // 비밀번호 유효성 검사
  const validatePassword = (password: string) => {
    if (!password) return false;
    
    if (password.length < 2 || password.length > 20) {
      setPasswordError('비밀번호는 2자에서 20자 사이여야 합니다.');
      return false;
    }
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (!hasLetter || !hasNumber || !hasSpecial) {
      setPasswordError('비밀번호는 영문, 숫자, 특수문자를 각각 하나 이상 포함해야 합니다.');
      return false;
    }
    return true;
  };

  // 사용자 이름 유효성 검사
  const validateUsername = (username: string) => {
    if (!username) return false;
    
    const koreanLength = (username.match(/[가-힣]/g) || []).length;
    const englishLength = (username.match(/[a-zA-Z]/g) || []).length;
    
    if (koreanLength > 0 && koreanLength < 2) {
      setUsernameError('한글은 2자 이상이어야 합니다.');
      return false;
    }
    if (englishLength > 0 && englishLength < 3) {
      setUsernameError('영문은 3자 이상이어야 합니다.');
      return false;
    }
    if (koreanLength === 0 && englishLength === 0) {
      setUsernameError('한글(2자 이상) 또는 영문(3자 이상)을 입력해주세요.');
      return false;
    }
    return true;
  };

  // 비밀번호 확인 유효성 검사
  const validateConfirmPassword = (confirmPwd: string) => {
    if (!confirmPwd) return false;
    
    if (confirmPwd !== password) {
      setConfirmPasswordError('비밀번호가 일치하지 않습니다.');
      return false;
    }
    return true;
  };

  // 입력값 변경 핸들러
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (value) {
      setEmailError('');
    } else if (emailError && !emailError.includes('입력해주세요')) {
      setEmailError('');
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (value) {
      setPasswordError('');
    } else if (passwordError && !passwordError.includes('입력해주세요')) {
      setPasswordError('');
    }
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    if (value) {
      setUsernameError('');
    } else if (usernameError && !usernameError.includes('입력해주세요')) {
      setUsernameError('');
    }
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConfirmPassword(value);
    if (value) {
      setConfirmPasswordError('');
    } else if (confirmPasswordError && !confirmPasswordError.includes('입력해주세요')) {
      setConfirmPasswordError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 모든 에러 메시지 초기화
    setEmailError('');
    setPasswordError('');
    setUsernameError('');
    setConfirmPasswordError('');

    // 빈 값 체크
    const isEmailFilled = checkEmpty(email, setEmailError, '이메일');
    const isPasswordFilled = checkEmpty(password, setPasswordError, '비밀번호');
    
    if (isLogin) {
      if (!isEmailFilled || !isPasswordFilled) {
        return;
      }

      // 유효성 검사
      const isEmailValid = validateEmail(email);
      const isPasswordValid = validatePassword(password);

      if (!isEmailValid || !isPasswordValid) {
        return;
      }

      try {
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setPasswordError('이메일 또는 비밀번호가 올바르지 않습니다.');
          return;
        }

        router.push('/chat'); // 로그인 성공 후 리다이렉트
      } catch (error) {
        setPasswordError('로그인 중 오류가 발생했습니다.');
      }
    } else {
      const isUsernameFilled = checkEmpty(username, setUsernameError, '사용자 이름');
      const isConfirmPasswordFilled = checkEmpty(confirmPassword, setConfirmPasswordError, '비밀번호 확인');

      if (!isEmailFilled || !isPasswordFilled || !isUsernameFilled || !isConfirmPasswordFilled) {
        return;
      }

      // 유효성 검사
      const isEmailValid = validateEmail(email);
      const isPasswordValid = validatePassword(password);
      const isUsernameValid = validateUsername(username);
      const isConfirmPasswordValid = validateConfirmPassword(confirmPassword);

      if (!isEmailValid || !isPasswordValid || !isUsernameValid || !isConfirmPasswordValid) {
        return;
      }

      try {
        // 1. Supabase Auth로 회원가입
        console.log('회원가입 시도:', { email, password, username });
        
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });

        console.log('Supabase Auth 응답:', { authData, authError });

        if (authError) {
          console.error('Supabase Auth 에러:', authError);
          throw authError;
        }

        if (authData.user) {
          // 2. users 테이블에 사용자 정보 저장
          console.log('users 테이블 저장 시도:', {
            id: authData.user.id,
            email,
            username,
            created_at: new Date().toISOString()
          });

          const { error: dbError } = await supabase
            .from('users')
            .insert([
              {
                id: authData.user.id,
                email: email,
                username: username,
                created_at: new Date().toISOString(),
              }
            ]);

          console.log('users 테이블 저장 결과:', { dbError });

          if (dbError) {
            console.error('Database 에러:', dbError);
            throw dbError;
          }

          // 3. 자동 로그인
          console.log('자동 로그인 시도');
          try {
            const result = await signIn('credentials', {
              email,
              password,
              redirect: false,
              callbackUrl: '/chat'
            });

            console.log('자동 로그인 결과:', result);

            if (result?.error) {
              console.error('자동 로그인 에러:', result.error);
              throw new Error(result.error);
            }

            if (result?.url) {
              router.push(result.url);
            } else {
              router.push('/chat');
            }
          } catch (error) {
            console.error('자동 로그인 에러:', error);
            setConfirmPasswordError('회원가입은 완료되었으나 자동 로그인에 실패했습니다. 다시 로그인해 주세요.');
            setIsLogin(true); // 로그인 폼으로 전환
          }
        }
      } catch (error) {
        console.error('회원가입 전체 에러:', error);
        setConfirmPasswordError('회원가입 중 오류가 발생했습니다.');
      }
    }
  };

  const toggleForm = () => {
    setIsLogin(!isLogin);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setUsername('');
    // 에러 메시지 초기화
    setEmailError('');
    setPasswordError('');
    setUsernameError('');
    setConfirmPasswordError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            {isLogin ? 'Login' : 'Sign Up'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {isLogin 
              ? 'Enter your credentials to access your account'
              : 'Create your account to get started'
            }
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {!isLogin && (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="your_username"
                  required={!isLogin}
                  className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                    usernameError ? 'border-[#E11D48]' : 'border-gray-300'
                  }`}
                  value={username}
                  onChange={handleUsernameChange}
                  style={{ WebkitAppearance: 'none' }}
                />
                {usernameError && (
                  <p className="mt-1 text-sm text-[#E11D48]" style={{ WebkitAppearance: 'none' }}>{usernameError}</p>
                )}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="example@email.com"
                required
                className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                  emailError ? 'border-[#E11D48]' : 'border-gray-300'
                }`}
                value={email}
                onChange={handleEmailChange}
                style={{ WebkitAppearance: 'none' }}
              />
              {emailError && (
                <p className="mt-1 text-sm text-[#E11D48]" style={{ WebkitAppearance: 'none' }}>{emailError}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                  passwordError ? 'border-[#E11D48]' : 'border-gray-300'
                }`}
                value={password}
                onChange={handlePasswordChange}
                style={{ WebkitAppearance: 'none' }}
              />
              {passwordError && (
                <p className="mt-1 text-sm text-[#E11D48]" style={{ WebkitAppearance: 'none' }}>{passwordError}</p>
              )}
            </div>
            {!isLogin && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  required={!isLogin}
                  className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                    confirmPasswordError ? 'border-[#E11D48]' : 'border-gray-300'
                  }`}
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  style={{ WebkitAppearance: 'none' }}
                />
                {confirmPasswordError && (
                  <p className="mt-1 text-sm text-[#E11D48]" style={{ WebkitAppearance: 'none' }}>{confirmPasswordError}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              {isLogin ? 'Login' : 'Sign Up'}
            </button>
            
            <div className="text-center">
              <p className="text-sm text-gray-900">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={toggleForm}
                  className="text-indigo-600 hover:text-indigo-500 font-medium"
                >
                  {isLogin ? "Sign up" : "Login"}
                </button>
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
} 