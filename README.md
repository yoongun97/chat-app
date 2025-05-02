# Next.js ChatGPT Clone

이 프로젝트는 Next.js, Next-Auth, Supabase를 사용하여 개발된 ChatGPT 클론 애플리케이션입니다.

## 🚀 주요 기능

### 인증 시스템
- ✅ 이메일/비밀번호 기반 로그인 및 회원가입
- ✅ Next-Auth와 Supabase Auth 통합
- ✅ 보안된 라우팅 및 인증 상태 관리

### 채팅 기능
- ✅ 실시간 채팅 인터페이스
- ✅ GPT API 통합
- ✅ 채팅 히스토리 저장 및 관리
- ✅ 채팅방 제목 자동 생성 및 수정
- ✅ 채팅방 삭제 기능

### UI/UX
- ✅ 반응형 디자인 (모바일/데스크톱)
- ✅ 사이드바 토글 (모바일)
- ✅ 로딩 상태 표시
- ✅ 토스트 알림
- ✅ 메시지 자동 스크롤
- ✅ 채팅 버블 최대 너비 제한 (60%)

## 🛠 기술 스택

- **Frontend**: Next.js, TypeScript, TailwindCSS
- **Backend**: Supabase
- **인증**: Next-Auth, Supabase Auth
- **AI**: OpenAI GPT API
- **스타일링**: shadcn/ui

## 📦 데이터베이스 구조

### Users 테이블
```sql
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Chats 테이블
```sql
CREATE TABLE chats (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_visited_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Messages 테이블
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  chat_id UUID REFERENCES chats(id),
  content TEXT,
  role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🔒 보안

### Row Level Security (RLS)
- Users: 자신의 프로필만 접근 가능
- Chats: 자신의 채팅방만 CRUD 가능
- Messages: 자신의 채팅방 메시지만 접근 가능

## 🚀 시작하기

1. 환경 설정
```bash
# 저장소 클론
git clone [repository-url]

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env.local
```

2. 환경 변수 설정
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPEN_AI_API_KEY=your_openai_api_key
```

3. 개발 서버 실행
```bash
npm run dev
```

## 📱 주요 기능 스크린샷

(스크린샷 추가 예정)

## 🔄 실시간 기능

- 채팅방 목록 실시간 업데이트
- 메시지 전송 및 응답 실시간 표시
- 채팅방 제목 실시간 업데이트

## 🎯 향후 계획

- [ ] 다중 모델 선택 (GPT-3.5 / GPT-4)
- [ ] 유저별 메시지 token 사용량 표시
- [ ] 메시지 수정/재전송 기능
- [ ] 시스템 프롬프트 설정
- [ ] 다크모드 토글

## 📝 라이선스

MIT License

## 👥 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
