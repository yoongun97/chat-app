import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat',
  description: 'Chat with AI',
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
} 