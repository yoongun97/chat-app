'use client';

import { useState, useEffect, useRef, ClipboardEvent } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { getChatCompletion, Message, ChatModel } from '@/lib/openai';
import toast from 'react-hot-toast';

type MessageRole = 'user' | 'assistant';
type MessageType = 'text' | 'image';

interface ChatMessage {
  id: string;
  chat_id: string;
  content: string;
  role: MessageRole;
  created_at: string;
  type: MessageType;
  image_url?: string;
}

interface ChatThread {
  id: string;
  title: string | null;
  created_at: string;
  last_visited_at: string;
  model: ChatModel;
}

interface UserData {
  username: string;
  email: string;
  id: string;
}

interface PageProps {
  params: {
    chatId: string;
  };
}

export default function ChatPage({ params }: PageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(params.chatId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatThread | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ChatModel>('gpt-4.1-mini');
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // 세션 및 인증 상태 확인
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (status === 'loading') return;

        if (status === 'unauthenticated') {
          router.push('/');
          return;
        }

        if (!session?.user?.email) {
          setError('사용자 정보를 찾을 수 없습니다.');
          return;
        }

        setIsInitializing(false);
      } catch (err) {
        console.error('Auth check error:', err);
        setError('인증 확인 중 오류가 발생했습니다.');
      }
    };

    checkAuth();
  }, [session, status, router]);

  // 사용자 데이터 로드
  useEffect(() => {
    const loadUserData = async () => {
      if (isInitializing || !session?.user?.email) return;

      try {
        setIsLoading(true);
        const { data: authUser, error: authError } = await supabase.auth.getUser();
        
        if (authError) {
          console.error('Auth error:', authError);
          setError('인증 오류가 발생했습니다.');
          return;
        }

        const { data: existingUser, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('email', session.user.email)
          .single();

        if (fetchError?.code === 'PGRST116') {
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

          if (insertError) {
            console.error('Error creating new user:', insertError);
            setError('사용자 프로필 생성에 실패했습니다.');
            return;
          }

          setUserData(newUser);
          setCurrentUserId(newUser.id);
          toast.success('새 프로필이 생성되었습니다.');
        } else if (fetchError) {
          console.error('Error fetching user:', fetchError);
          setError('사용자 정보를 불러오는데 실패했습니다.');
          return;
        } else {
          setUserData(existingUser);
          setCurrentUserId(existingUser.id);
        }
      } catch (err) {
        console.error('User data loading error:', err);
        setError('사용자 정보를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [session, isInitializing]);

  // 채팅 스레드 가져오기
  useEffect(() => {
    const fetchChatThreads = async () => {
      if (!currentUserId) return;

      try {
        const { data: chats, error: chatsError } = await supabase
          .from('chats')
          .select('*')
          .eq('user_id', currentUserId)
          .order('last_visited_at', { ascending: false });

        if (chatsError) {
          toast.error('채팅 목록을 불러오는데 실패했습니다.');
          return;
        }

        setChatThreads(chats || []);

        const subscription = supabase
          .channel('chat_updates')
          .on('postgres_changes', 
            {
              event: '*',
              schema: 'public',
              table: 'chats',
              filter: `user_id=eq.${currentUserId}`
            },
            async () => {
              const { data: updatedChats, error: updateError } = await supabase
                .from('chats')
                .select('*')
                .eq('user_id', currentUserId)
                .order('last_visited_at', { ascending: false });

              if (updateError) {
                toast.error('채팅 목록 업데이트에 실패했습니다.');
                return;
              }

              if (updatedChats) {
                const filteredChats = updatedChats.filter(chat => chat.user_id === currentUserId);
                setChatThreads(filteredChats);
              }
            }
          )
          .subscribe();

        return () => {
          subscription.unsubscribe();
        };
      } catch {
        toast.error('채팅 목록을 불러오는데 실패했습니다.');
      }
    };

    if (!isInitializing && !isLoading && currentUserId) {
      fetchChatThreads();
    }
  }, [currentUserId, isInitializing, isLoading]);

  // 현재 채팅 및 메시지 가져오기
  useEffect(() => {
    const fetchChatAndMessages = async () => {
      if (!selectedChat || isInitializing || isLoading) return;

      try {
        const { data: chat, error: chatError } = await supabase
          .from('chats')
          .select('*')
          .eq('id', selectedChat)
          .single();

        if (chatError) {
          toast.error('채팅 내용을 불러오는데 실패했습니다.');
          return;
        }

        if (chat) {
          setCurrentChat(chat);
        }

        const { data: chatMessages, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', selectedChat)
          .order('created_at', { ascending: true });

        if (messagesError) {
          toast.error('메시지를 불러오는데 실패했습니다.');
          return;
        }

        if (chatMessages) {
          setMessages(chatMessages);
        }
      } catch {
        toast.error('채팅 내용을 불러오는데 실패했습니다.');
      }
    };

    if (!isInitializing && !isLoading && selectedChat) {
      fetchChatAndMessages();
    }
  }, [selectedChat, isInitializing, isLoading]);

  // 메시지 스크롤
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 로딩 화면
  if (isInitializing || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-900 mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-2">오류가 발생했습니다</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={async () => {
              try {
                await signOut({ redirect: false });
                router.push('/');
              } catch (err) {
                console.error('Logout error:', err);
                router.push('/');
              }
            }}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 사용자 정보가 없는 경우
  if (!userData) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">사용자 정보를 찾을 수 없습니다</h2>
          <button
            onClick={async () => {
              try {
                await signOut({ redirect: false });
                router.push('/');
              } catch (err) {
                console.error('Logout error:', err);
                router.push('/');
              }
            }}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const handleNewChatClick = () => {
    setIsNewChatModalOpen(true);
  };

  const handleNewChatCancel = () => {
    setIsNewChatModalOpen(false);
    setSelectedModel('gpt-4.1-mini'); // 기본값으로 리셋
  };

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
            model: selectedModel
          }
        ]);

      if (chatError) {
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
        toast.error('메시지 생성에 실패했습니다.');
        return;
      }

      setIsNewChatModalOpen(false);
      router.push(`/chat/${newChatId}`);
      toast.success('새로운 채팅방이 생성되었습니다.');
    } catch {
      toast.error('새 채팅방 생성에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 이미지 붙여넣기 처리
  const handlePaste = async (e: ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    
    if (!items) return;

    // audio-preview 모델인 경우 이미지 붙여넣기 비활성화
    if (currentChat?.model === 'gpt-4o-mini-audio-preview') {
      if (Array.from(items).some(item => item.type.indexOf('image') !== -1)) {
        e.preventDefault();
        toast.error('Audio Preview 모델에서는 이미지 분석을 사용할 수 없습니다.');
      }
      return;
    }

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        
        const file = items[i].getAsFile();
        if (!file) continue;

        // 이미지를 base64로 변환
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Image = event?.target?.result as string;
          setImagePreview(base64Image);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  // 이미지 취소
  const handleCancelImage = () => {
    setImagePreview(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && !imagePreview) || !selectedChat || isSending || !currentUserId) return;

    const timestamp = new Date().toISOString();
    const userMessages: ChatMessage[] = [];

    try {
      if (imagePreview) {
        userMessages.push({
          id: crypto.randomUUID(),
          chat_id: selectedChat,
          content: '이미지 메시지',
          role: 'user',
          created_at: timestamp,
          type: 'image',
          image_url: imagePreview
        });
      }

      if (message.trim()) {
        userMessages.push({
          id: crypto.randomUUID(),
          chat_id: selectedChat,
          content: message.trim(),
          role: 'user',
          created_at: timestamp,
          type: 'text'
        });
      }

      // UI 업데이트
      setMessages(prev => [...prev, ...userMessages]);
      setIsSending(true);
      setMessage('');
      setImagePreview(null);

      // 메시지들 저장 - content와 type 필드만 전송
      const messagesToSave = userMessages.map(msg => ({
        id: msg.id,
        chat_id: msg.chat_id,
        content: msg.content,
        role: msg.role,
        created_at: msg.created_at,
        type: msg.type,
        ...(msg.type === 'image' ? { image_url: msg.image_url } : {})
      }));

      const { error: messageError } = await supabase
        .from('messages')
        .insert(messagesToSave);

      if (messageError) throw messageError;

      // 첫 번째 유저 메시지인지 확인
      const { data: existingUserMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('chat_id', selectedChat)
        .eq('role', 'user');

      const isFirstUserMessage = !existingUserMessages || existingUserMessages.length <= userMessages.length;

      // 채팅방 제목 업데이트
      const { data: updateData, error: updateError } = await supabase
        .from('chats')
        .update({
          last_visited_at: timestamp,
          ...(isFirstUserMessage ? { 
            title: message.trim() || '이미지 채팅'
          } : {})
        })
        .eq('id', selectedChat)
        .eq('user_id', currentUserId)
        .select();

      if (updateError) throw updateError;

      // UI 업데이트
      if (isFirstUserMessage && updateData?.[0]) {
        const updatedChat = updateData[0];
        setCurrentChat(prev => 
          prev ? { ...prev, title: updatedChat.title } : null
        );
        
        setChatThreads(prev => 
          prev.map(chat => 
            chat.id === selectedChat 
              ? { ...chat, title: updatedChat.title } 
              : chat
          )
        );
      }

      // API 요청용 메시지 준비
      const messageHistory: Message[] = [
        ...messages.map(msg => {
          if (msg.type === 'image' && msg.image_url) {
            return {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: msg.image_url
                  }
                },
                {
                  type: 'text',
                  text: '이 이미지를 분석해주세요.'
                }
              ]
            } as Message;
          }
          return {
            role: msg.role,
            content: msg.content
          } as Message;
        }),
        ...userMessages.map(msg => {
          if (msg.type === 'image' && msg.image_url) {
            return {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: msg.image_url
                  }
                },
                {
                  type: 'text',
                  text: '이 이미지를 분석해주세요.'
                }
              ]
            } as Message;
          }
          return {
            role: msg.role,
            content: msg.content
          } as Message;
        })
      ];

      // 이미지가 포함된 경우 gpt-4.1-mini 모델 강제 사용
      const modelToUse = imagePreview ? 'gpt-4.1-mini' : (currentChat?.model || 'gpt-4.1-mini');
      const gptResponse = await getChatCompletion(messageHistory, modelToUse);

      if (gptResponse) {
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          chat_id: selectedChat,
          content: gptResponse,
          role: 'assistant',
          created_at: new Date().toISOString(),
          type: 'text'
        };

        const { error: assistantError } = await supabase
          .from('messages')
          .insert([assistantMessage]);

        if (assistantError) throw assistantError;

        setMessages(prev => [...prev, assistantMessage]);
      }

      // 채팅 목록 업데이트
      const { data: updatedChats, error: chatsError } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', currentUserId)
        .order('last_visited_at', { ascending: false });

      if (!chatsError && updatedChats) {
        setChatThreads(updatedChats);
      }

    } catch {
      console.error('Error in handleSendMessage');
      setMessages(prev => prev.filter(msg => !userMessages.find(um => um.id === msg.id)));
      setMessage(message);
      setImagePreview(imagePreview);
      toast.error('메시지 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSending(false);
    }
  };

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
    } catch {
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
    } catch {
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

  // ModelSelector 컴포넌트를 읽기 전용으로 변경
  const ModelDisplay = () => (
    <div className="ml-2 p-1 text-sm text-gray-600">
      {currentChat?.model === 'gpt-4.1-mini' ? 'GPT-4.1 Mini' : 'GPT-4 Audio Preview'}
    </div>
  );

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
              onClick={handleNewChatClick}
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
            onClick={async () => {
              try {
                await signOut({ redirect: false });
                router.push('/');
              } catch (err) {
                console.error('Logout error:', err);
                router.push('/');
              }
            }}
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
          {selectedChat && <ModelDisplay />}
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
                {msg.type === 'image' && msg.image_url ? (
                  <Image 
                    src={msg.image_url} 
                    alt="Uploaded content" 
                    width={300}
                    height={300}
                    className="max-w-full rounded object-contain"
                  />
                ) : (
                  msg.content
                )}
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

        {/* 메시지 입력 영역 */}
        <div className="border-t border-gray-200 bg-white sticky bottom-0 z-30">
          {currentChat?.model === 'gpt-4o-mini-audio-preview' && (
            <div className="px-4 py-2 bg-yellow-50 text-yellow-800 text-sm">
              현재 Audio Preview 모델을 사용 중입니다. 이미지 분석은 사용할 수 없습니다.
            </div>
          )}
          {imagePreview && (
            <div className="p-2 border-b border-gray-200">
              <div className="relative inline-block">
                <Image 
                  src={imagePreview} 
                  alt="Preview" 
                  width={128}
                  height={128}
                  className="max-h-32 rounded object-contain"
                />
                <button
                  onClick={handleCancelImage}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          <form onSubmit={handleSendMessage} className="p-4 flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={handlePaste}
              placeholder={
                currentChat?.model === 'gpt-4o-mini-audio-preview'
                  ? "메시지를 입력하세요 (이미지 분석 불가)"
                  : "메시지를 입력하거나 이미지를 붙여넣으세요..."
              }
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

      {/* 새 채팅방 생성 모달 */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">새 채팅방 생성</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                모델 선택
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ChatModel)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                <option value="gpt-4o-mini-audio-preview">GPT-4 Audio Preview</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleNewChatCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleNewChat}
                className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition-colors"
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 