import type { Conversation, Message } from '@shared-types/agent';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export class ConversationManager {
  private conversations = new Map<string, Conversation>();

  createConversation(title?: string, id?: string): Conversation {
    const conversation: Conversation = {
      id: id ?? generateId(),
      title: title || '新会话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteConversation(conversationId: string): boolean {
    return this.conversations.delete(conversationId);
  }

  addMessage(conversationId: string, message: Omit<Message, 'id' | 'conversationId' | 'createdAt' | 'updatedAt'>): Message {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const newMessage: Message = {
      ...message,
      id: generateId(),
      conversationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    conversation.messages.push(newMessage);
    conversation.updatedAt = Date.now();

    return newMessage;
  }

  updateMessage(conversationId: string, messageId: string, updates: Partial<Message>): Message | undefined {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return undefined;

    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) return undefined;

    Object.assign(message, updates);
    message.updatedAt = Date.now();
    conversation.updatedAt = Date.now();

    return message;
  }

  getMessages(conversationId: string): Message[] {
    const conversation = this.conversations.get(conversationId);
    return conversation ? conversation.messages : [];
  }

  getLastMessage(conversationId: string): Message | undefined {
    const messages = this.getMessages(conversationId);
    return messages.length > 0 ? messages[messages.length - 1] : undefined;
  }
}