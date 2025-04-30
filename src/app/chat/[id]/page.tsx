'use client';

import { useParams } from 'next/navigation';
import ChatPage from '../page';

export default function IndividualChatPage() {
  const params = useParams();
  return <ChatPage chatId={params.id as string} />;
} 