"use client";

/**
 * The in-app channel of the reminder agent (T3): the person's last few
 * messages on their home page, the same text as the email.
 */
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/dates/format";

type Message = { id: string; subject: string; body: string; sentAt: string };

export function AgentMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent/mine")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Message[]) => {
        if (!cancelled && Array.isArray(data)) setMessages(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (messages.length === 0) return null;
  return (
    <section className="rounded-lg border bg-card" aria-label="Messages from Academic Planning">
      <p className="border-b px-4 py-2 text-sm font-medium">Messages from Academic Planning</p>
      <ul className="divide-y">
        {messages.map((message) => (
          <li key={message.id} className="px-4 py-2 text-sm">
            <details>
              <summary className="cursor-pointer">
                <span className="font-medium">{message.subject}</span>
                <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(message.sentAt)}</span>
              </summary>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{message.body}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
