'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

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
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(chatId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatThread | null>(null);

  // Fetch chat threads
  useEffect(() => {
    const fetchChatThreads = async () => {
      if (session?.user?.email) {
        const { data: chats, error } = await supabase
          .from('chats')
          .select('*')
          .order('last_visited_at', { ascending: false });

        if (!error && chats) {
          setChatThreads(chats);
        }
      }
    };

    fetchChatThreads();
  }, [session]);

  // Fetch current chat and messages
  useEffect(() => {
    const fetchChatAndMessages = async () => {
      if (selectedChat) {
        // Fetch chat details
        const { data: chat, error: chatError } = await supabase
          .from('chats')
          .select('*')
          .eq('id', selectedChat)
          .single();

        if (!chatError && chat) {
          setCurrentChat(chat);
        }

        // Fetch messages
        const { data: chatMessages, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', selectedChat)
          .order('created_at', { ascending: true });

        if (!messagesError && chatMessages) {
          setMessages(chatMessages);
        }
      }
    };

    fetchChatAndMessages();
  }, [selectedChat]);

  useEffect(() => {
    const checkAuthAndFetchUser = async () => {
      try {
        if (status === 'loading') return;

        if (status === 'unauthenticated') {
          router.push('/');
          return;
        }

        if (session?.user?.email) {
          const { data, error } = await supabase
            .from('users')
            .select('username, email, id')
            .eq('email', session.user.email)
            .single();

          if (error || !data) {
            router.push('/');
            return;
          }

          setUserData(data);
        }
      } catch (error) {
        router.push('/');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthAndFetchUser();
  }, [session, status, router]);

  const handleNewChat = async () => {
    try {
      const newChatId = crypto.randomUUID();
      
      const { error } = await supabase
        .from('chats')
        .insert([
          {
            id: newChatId,
            created_at: new Date().toISOString(),
            last_visited_at: new Date().toISOString(),
            title: null
          }
        ]);

      if (error) throw error;

      router.push(`/chat/${newChatId}`);
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedChat) return;

    const timestamp = new Date().toISOString();
    
    try {
      // Check if this will be the first message
      const { data: currentMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('chat_id', selectedChat);

      const isFirstMessage = !currentMessages || currentMessages.length === 0;

      // Insert the message
      const { error: messageError } = await supabase
        .from('messages')
        .insert([
          {
            chat_id: selectedChat,
            content: message,
            role: 'user',
            created_at: timestamp
          }
        ]);

      if (messageError) throw messageError;

      // Update chat's last_visited_at and title if it's the first message
      const { error: updateError } = await supabase
        .from('chats')
        .update({
          last_visited_at: timestamp,
          ...(isFirstMessage ? { title: message.slice(0, 50) } : {})
        })
        .eq('id', selectedChat);

      if (updateError) throw updateError;

      setMessage('');

      // Refresh messages
      const { data: newMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', selectedChat)
        .order('created_at', { ascending: true });

      if (newMessages) {
        setMessages(newMessages);
      }

      // Refresh chat threads to update order and titles
      const { data: updatedChats } = await supabase
        .from('chats')
        .select('*')
        .order('last_visited_at', { ascending: false });

      if (updatedChats) {
        setChatThreads(updatedChats);
      }

      // Update current chat
      const { data: updatedChat } = await supabase
        .from('chats')
        .select('*')
        .eq('id', selectedChat)
        .single();

      if (updatedChat) {
        setCurrentChat(updatedChat);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

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
      {/* 왼쪽 사이드바 */}
      <div className="w-80 bg-gray-100 flex flex-col">
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
                className={`px-4 py-3 hover:bg-gray-200 cursor-pointer flex items-center gap-3 transition-colors ${
                  selectedChat === thread.id ? 'bg-gray-200' : ''
                }`}
                onClick={() => router.push(`/chat/${thread.id}`)}
              >
                <span className="text-gray-600">💬</span>
                <span className="text-gray-800 truncate">
                  {thread.title || 'New Chat'}
                </span>
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

      {/* 오른쪽 채팅 영역 */}
      <div className="flex-1 flex flex-col bg-white">
        {/* 채팅 헤더 */}
        <div className="border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <h2 className="text-xl font-semibold text-gray-800">
              {currentChat?.title || 'New Chat'}
            </h2>
          </div>
          <button className="text-gray-600 hover:text-gray-800 transition-colors">
            +
          </button>
        </div>

        {/* 채팅 메시지 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 bg-gray-200 rounded-full" />
              )}
              <div
                className={`px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 bg-blue-200 rounded-full" />
              )}
            </div>
          ))}
        </div>

        {/* 메시지 입력 영역 */}
        <div className="p-4 border-t border-gray-200">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <button
              type="submit"
              className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <span>➤</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
} 