'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { getChatCompletion, Message } from '@/lib/openai';
import toast from 'react-hot-toast';

interface ChatMessage {
  id: string;
  chat_id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
}

interface ChatThread {
  id: string;
  title: string | null;
  created_at: string;
  last_visited_at: string;
}

interface UserData {
  username: string;
  email: string;
  id: string;
}

interface Props {
  chatId?: string;
}

export default function ChatPage({ chatId }: Props) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(chatId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatThread | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch chat threads
  useEffect(() => {
    const fetchChatThreads = async () => {
      if (!currentUserId) {
        console.log('No current user ID');
        return;
      }

      try {
        console.log('Fetching chats for user ID:', currentUserId);
        
        // 초기 채팅방 목록 조회
        const { data: chats, error: chatsError } = await supabase
          .from('chats')
          .select('*')
          .eq('user_id', currentUserId)
          .order('last_visited_at', { ascending: false });

        if (chatsError) {
          console.error('Error fetching chats:', chatsError);
          toast.error('채팅 목록을 불러오는데 실패했습니다.');
          return;
        }

        console.log('Initial chats loaded:', chats);
        setChatThreads(chats || []);

        // 실시간 구독 설정
        const subscription = supabase
          .channel('chat_updates')
          .on('postgres_changes', 
            {
              event: '*',
              schema: 'public',
              table: 'chats',
              filter: `user_id=eq.${currentUserId}`
            },
            async (payload) => {
              console.log('Received chat update:', payload);
              
              // 변경된 채팅방 목록 다시 조회
              const { data: updatedChats, error: updateError } = await supabase
                .from('chats')
                .select('*')
                .eq('user_id', currentUserId)
                .order('last_visited_at', { ascending: false });

              if (updateError) {
                console.error('Error fetching updated chats:', updateError);
                return;
              }

              console.log('Updated chats:', updatedChats);
              setChatThreads(updatedChats || []);
            }
          )
          .subscribe();

        // 컴포넌트 언마운트 시 구독 해제
        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('Error in fetchChatThreads:', error);
        toast.error('채팅 목록을 불러오는데 실패했습니다.');
      }
    };

    fetchChatThreads();
  }, [currentUserId, supabase]);

  // Fetch current chat and messages
  useEffect(() => {
    const fetchChatAndMessages = async () => {
      if (selectedChat) {
        try {
          // Fetch chat details
          const { data: chat, error: chatError } = await supabase
            .from('chats')
            .select('*')
            .eq('id', selectedChat)
            .single();

          if (chatError) throw chatError;

          if (chat) {
            setCurrentChat(chat);
          }

          // Fetch messages
          const { data: chatMessages, error: messagesError } = await supabase
            .from('messages')
            .select('*')
            .eq('chat_id', selectedChat)
            .order('created_at', { ascending: true });

          if (messagesError) throw messagesError;

          if (chatMessages) {
            setMessages(chatMessages);
          }
        } catch (error) {
          console.error('Error fetching chat and messages:', error);
          toast.error('채팅 내용을 불러오는데 실패했습니다.');
        }
      }
    };

    fetchChatAndMessages();
  }, [selectedChat]);

  useEffect(() => {
    const checkAuthAndFetchUser = async () => {
      try {
        console.log('Auth Status:', status);
        console.log('Session:', session);

        if (status === 'loading') {
          console.log('Authentication is loading...');
          return;
        }

        if (status === 'unauthenticated') {
          console.log('User is not authenticated, redirecting to home...');
          router.push('/');
          return;
        }

        if (session?.user?.email) {
          console.log('Attempting to fetch user data for email:', session.user.email);
          
          // 먼저 auth.users() 테이블에서 현재 사용자 ID 확인
          const { data: authUser, error: authError } = await supabase.auth.getUser();
          console.log('Auth User Data:', authUser);
          
          if (authError) {
            console.error('Auth User Error:', authError);
            return;
          }

          // users 테이블에서 이메일로 데이터 조회 시도
          const { data: existingUser, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email) // id 대신 email로 조회
            .single();

          console.log('Existing User Check:', { existingUser, fetchError });

          // 사용자가 없는 경우에만 새로 생성
          if (fetchError?.code === 'PGRST116') {
            console.log('Creating new user record...');
            
            // 이메일에서 사용자 이름 추출 (@ 앞부분)
            const username = session.user.email.split('@')[0];
            
            const { data: newUser, error: insertError } = await supabase
              .from('users')
              .insert([
                {
                  id: authUser.user.id,
                  email: session.user.email,
                  username: username,
                  created_at: new Date().toISOString()
                }
              ])
              .select()
              .single();

            console.log('New User Creation Result:', { newUser, insertError });

            if (insertError) {
              console.error('Failed to create user:', insertError);
              toast.error('사용자 프로필 생성에 실패했습니다.');
              router.push('/');
              return;
            }

            setUserData(newUser);
            toast.success('새 프로필이 생성되었습니다.');
          } else if (fetchError) {
            console.error('Error fetching user:', fetchError);
            toast.error('사용자 정보를 불러오는데 실패했습니다.');
            router.push('/');
            return;
          } else {
            // 기존 사용자가 있는 경우
            console.log('Existing user found:', existingUser);
            if (existingUser.id !== authUser.user.id) {
              // ID가 일치하지 않는 경우 업데이트
              const { error: updateError } = await supabase
                .from('users')
                .update({ id: authUser.user.id })
                .eq('email', session.user.email);
              
              if (updateError) {
                console.error('Failed to update user ID:', updateError);
                toast.error('사용자 정보 업데이트에 실패했습니다.');
                router.push('/');
                return;
              }
              
              // 업데이트된 사용자 정보 다시 조회
              const { data: updatedUser } = await supabase
                .from('users')
                .select('*')
                .eq('email', session.user.email)
                .single();
                
              if (updatedUser) {
                setUserData(updatedUser);
              }
            } else {
              setUserData(existingUser);
            }
          }
        }
      } catch (error) {
        console.error('Authentication Error:', error);
        router.push('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthAndFetchUser();
  }, [session, status, router]);

  // 현재 사용자 정보 조회
  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (!session?.user?.email) return;

      try {
        const { data: user, error } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', session.user.email)
          .single();

        if (error) {
          console.error('Error fetching current user:', error);
          return;
        }

        if (user) {
          console.log('Current user set:', user);
          setCurrentUserId(user.id);
        }
      } catch (error) {
        console.error('Error in fetchCurrentUser:', error);
      }
    };

    fetchCurrentUser();
  }, [session, supabase]);

  const handleNewChat = async () => {
    if (!currentUserId) {
      toast.error('로그인이 필요합니다.');
      return;
    }

    try {
      const newChatId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      
      const { error: chatError } = await supabase
        .from('chats')
        .insert([
          {
            id: newChatId,
            user_id: currentUserId,
            created_at: timestamp,
            last_visited_at: timestamp,
            title: null
          }
        ]);

      if (chatError) {
        console.error('Error creating chat:', chatError);
        toast.error('새 채팅방 생성에 실패했습니다.');
        return;
      }

      const welcomeMessage = {
        id: crypto.randomUUID(),
        chat_id: newChatId,
        content: "안녕하세요! 무엇을 도와드릴까요? 오늘 어떤 주제에 대해 이야기 나누고 싶으신가요?",
        role: 'assistant' as const,
        created_at: timestamp
      };

      const { error: messageError } = await supabase
        .from('messages')
        .insert([welcomeMessage]);

      if (messageError) {
        console.error('Error creating welcome message:', messageError);
        toast.error('메시지 생성에 실패했습니다.');
        return;
      }

      router.push(`/chat/${newChatId}`);
      toast.success('새로운 채팅방이 생성되었습니다.');
    } catch (error) {
      console.error('Failed to create new chat:', error);
      toast.error('새 채팅방 생성에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedChat || isSending || !currentUserId) return;

    const timestamp = new Date().toISOString();
    const userMessage = {
      id: crypto.randomUUID(),
      chat_id: selectedChat,
      content: message,
      role: 'user' as const,
      created_at: timestamp
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsSending(true);
    setMessage('');
    
    try {
      // 사용자 메시지 저장
      const { error: messageError } = await supabase
        .from('messages')
        .insert([userMessage]);

      if (messageError) throw messageError;

      // 채팅방 last_visited_at 업데이트
      const { error: updateError } = await supabase
        .from('chats')
        .update({
          last_visited_at: timestamp,
          ...(messages.length === 0 ? { title: message.slice(0, 50) } : {})
        })
        .eq('id', selectedChat)
        .eq('user_id', currentUserId); // 현재 사용자의 채팅방만 업데이트

      if (updateError) throw updateError;

      // GPT 응답 처리
      const messageHistory: Message[] = [
        ...messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: message }
      ];

      const gptResponse = await getChatCompletion(messageHistory);

      if (gptResponse) {
        const assistantMessage = {
          id: crypto.randomUUID(),
          chat_id: selectedChat,
          content: gptResponse,
          role: 'assistant' as const,
          created_at: new Date().toISOString()
        };

        const { error: assistantError } = await supabase
          .from('messages')
          .insert([assistantMessage]);

        if (assistantError) throw assistantError;

        setMessages(prev => [...prev, assistantMessage]);
      }

      // 채팅방 목록 수동 업데이트
      const { data: updatedChats, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', currentUserId)
        .order('last_visited_at', { ascending: false });

      if (!chatsError && updatedChats) {
        setChatThreads(updatedChats);
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
      setMessage(message);
      toast.error('메시지 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSending(false);
    }
  };

  // 실시간 구독 설정을 위한 useEffect
  useEffect(() => {
    if (!currentUserId) return;

    // 실시간 구독 설정
    const subscription = supabase
      .channel('chat_updates')
      .on('postgres_changes', 
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: `user_id=eq.${currentUserId}`
        },
        async (payload) => {
          console.log('Received chat update:', payload);
          
          // 변경된 채팅방 목록 조회 (현재 사용자의 채팅방만)
          const { data: updatedChats, error: updateError } = await supabase
            .from('chats')
            .select('*')
            .eq('user_id', currentUserId)
            .order('last_visited_at', { ascending: false });

          if (updateError) {
            console.error('Error fetching updated chats:', updateError);
            return;
          }

          if (updatedChats) {
            // 추가 필터링
            const filteredChats = updatedChats.filter(chat => chat.user_id === currentUserId);
            console.log('Filtered chats for current user:', filteredChats);
            setChatThreads(filteredChats);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [currentUserId, supabase]);

  // 초기 채팅방 목록 로드
  useEffect(() => {
    const loadInitialChats = async () => {
      if (!currentUserId) return;

      try {
        const { data: chats, error } = await supabase
          .from('chats')
          .select('*')
          .eq('user_id', currentUserId)
          .order('last_visited_at', { ascending: false });

        if (error) {
          console.error('Error loading initial chats:', error);
          toast.error('채팅방 목록을 불러오는데 실패했습니다.');
          return;
        }

        if (chats) {
          console.log('Initial chats loaded:', chats);
          setChatThreads(chats);
        }
      } catch (error) {
        console.error('Error in loadInitialChats:', error);
      }
    };

    loadInitialChats();
  }, [currentUserId, supabase]);

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 버블링 방지
    setChatToDelete(chatId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!chatToDelete) return;

    try {
      // 채팅방만 삭제 (메시지는 보존됨)
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatToDelete);

      if (error) throw error;

      // UI에서 채팅방 제거
      setChatThreads(prev => prev.filter(chat => chat.id !== chatToDelete));
      
      // 현재 보고 있는 채팅방이 삭제된 경우 처리
      if (selectedChat === chatToDelete) {
        setSelectedChat(null);
        setMessages([]);
        setCurrentChat(null);
        router.push('/chat');
      }

      toast.success('채팅방이 삭제되었습니다.');
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('채팅방 삭제에 실패했습니다.');
    } finally {
      setIsDeleteModalOpen(false);
      setChatToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setIsDeleteModalOpen(false);
    setChatToDelete(null);
  };

  // 제목 수정 시작
  const handleEditClick = () => {
    setEditedTitle(currentChat?.title || '');
    setIsEditingTitle(true);
  };

  // 제목 수정 저장
  const handleTitleSave = async () => {
    if (!currentChat) return;

    try {
      const { error } = await supabase
        .from('chats')
        .update({ title: editedTitle.trim() || '새로운 채팅' })
        .eq('id', currentChat.id);

      if (error) throw error;

      // UI 업데이트
      setCurrentChat(prev => prev ? { ...prev, title: editedTitle.trim() || '새로운 채팅' } : null);
      setChatThreads(prev => 
        prev.map(chat => 
          chat.id === currentChat.id 
            ? { ...chat, title: editedTitle.trim() || '새로운 채팅' } 
            : chat
        )
      );

      setIsEditingTitle(false);
      toast.success('채팅방 제목이 수정되었습니다.');
    } catch (error) {
      console.error('Error updating chat title:', error);
      toast.error('제목 수정에 실패했습니다.');
    }
  };

  // Enter 키로 저장, Esc 키로 취소
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  // 새 메시지가 추가될 때마다 스크롤을 아래로 이동
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!userData) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
      router.push('/');
    } catch (error) {
      router.push('/');
    }
  };

  return (
    <div className="flex h-screen">
      {/* 모바일 사이드바 토글 버튼 */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-gray-800 text-white p-2 rounded-lg"
      >
        {isSidebarOpen ? '✕' : '☰'}
      </button>

      {/* 사이드바 */}
      <div
        className={`${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 w-80 bg-gray-100 flex flex-col fixed lg:relative h-full z-40 transition-transform duration-300 ease-in-out`}
      >
        <div className="flex-1 flex flex-col">
          {/* New Chat 버튼 */}
          <div className="p-4">
            <button
              onClick={handleNewChat}
              className="w-full bg-white text-gray-800 font-semibold py-2 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors"
            >
              <span>+ New Chat</span>
            </button>
          </div>

          {/* 검색창 */}
          <div className="px-4 pb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">
                🔍
              </span>
            </div>
          </div>

          {/* 채팅 목록 */}
          <div className="flex-1 overflow-y-auto">
            {chatThreads.map((thread) => (
              <div
                key={thread.id}
                className={`group px-4 py-3 hover:bg-gray-200 cursor-pointer flex items-center justify-between transition-colors ${
                  selectedChat === thread.id ? 'bg-gray-200' : ''
                }`}
                onClick={() => {
                  router.push(`/chat/${thread.id}`);
                  setIsSidebarOpen(false); // 모바일에서 채팅방 선택 시 사이드바 닫기
                }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-gray-600 flex-shrink-0">💬</span>
                  <span className="text-gray-800 truncate">
                    {thread.title || 'New Chat'}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDeleteClick(thread.id, e)}
                  className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-700 p-1"
                  title="Delete chat"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 하단 메뉴 */}
        <div className="border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-3 text-left text-red-500 hover:bg-gray-200 flex items-center gap-3 transition-colors"
          >
            <span className="text-red-500">↪</span>
            <span>Logout</span>
          </button>

          <div className="px-4 py-3 hover:bg-gray-200 cursor-pointer flex items-center gap-3 transition-colors">
            <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
            <span className="text-gray-800">
              {userData?.username || 'Loading...'}
            </span>
          </div>
        </div>
      </div>

      {/* 채팅 영역 */}
      <div className="flex-1 flex flex-col bg-white relative lg:static">
        {/* 채팅 헤더 */}
        <div className="border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 bg-white z-30">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 bg-gray-200 rounded-full" />
            {isEditingTitle ? (
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="text-xl font-semibold text-gray-800 border-b border-gray-300 focus:border-blue-500 focus:outline-none px-1 w-full max-w-lg"
                placeholder="채팅방 제목을 입력하세요"
                autoFocus
              />
            ) : (
              <h2 className="text-xl font-semibold text-gray-800">
                {currentChat?.title || '새로운 채팅'}
              </h2>
            )}
          </div>
          <button
            onClick={handleEditClick}
            className="text-gray-600 hover:text-gray-800 transition-colors p-2"
            title="제목 수정"
          >
            ✏️
          </button>
        </div>

        {/* 채팅 메시지 영역 */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
              )}
              <div
                className={`px-4 py-2 rounded-lg max-w-[60%] break-words ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 bg-blue-200 rounded-full flex-shrink-0" />
              )}
            </div>
          ))}
          {isSending && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
              <div className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 max-w-[60%]">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 메시지 입력 영역 - 하단에 고정 */}
        <div className="border-t border-gray-200 bg-white sticky bottom-0 z-30">
          <form onSubmit={handleSendMessage} className="p-4 flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
              disabled={isSending}
            />
            <button
              type="submit"
              className={`px-4 py-2 rounded-lg transition-colors ${
                isSending
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gray-800 hover:bg-gray-700'
              } text-white`}
              disabled={isSending}
            >
              <span>➤</span>
            </button>
          </form>
        </div>
      </div>

      {/* 모바일 사이드바 오버레이 */}
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">채팅방 삭제</h3>
            <p className="text-gray-600 mb-6">
              이 채팅방을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 