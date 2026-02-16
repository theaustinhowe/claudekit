"use client";

import { format, formatDistanceToNow } from "date-fns";
import { ExternalLink, Loader2, MessageSquare, Send } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateIssueComment, useIssueComments } from "@/hooks/use-issue-comments";
import type { GitHubComment } from "@/lib/api";

interface IssueUser {
  login: string;
  avatar_url: string;
  html_url: string;
}

interface IssueAuthorInfoProps {
  user: IssueUser;
  createdAt: string;
}

export function IssueAuthorInfo({ user, createdAt }: IssueAuthorInfoProps) {
  const createdDate = new Date(createdAt);
  const fullDate = format(createdDate, "MMM d, yyyy 'at' h:mm a");
  const relativeDate = formatDistanceToNow(createdDate, { addSuffix: true });

  return (
    <div className="flex items-center gap-3 pb-4 border-b">
      <Image
        src={user.avatar_url}
        alt={user.login}
        width={32}
        height={32}
        className="h-8 w-8 rounded-full"
        unoptimized
      />
      <div className="flex flex-col">
        <a
          href={user.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium hover:underline"
        >
          {user.login}
        </a>
        <span className="text-xs text-muted-foreground">
          opened this issue{" "}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">{relativeDate}</span>
            </TooltipTrigger>
            <TooltipContent>{fullDate}</TooltipContent>
          </Tooltip>
        </span>
      </div>
    </div>
  );
}

interface IssueDescriptionProps {
  body: string | null;
}

export function IssueDescription({ body }: IssueDescriptionProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
      {body ? (
        <div className="text-sm rounded-lg border bg-muted/30 p-4 whitespace-pre-wrap">{body}</div>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground italic">No description provided.</p>
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment }: { comment: GitHubComment }) {
  const createdDate = new Date(comment.created_at);
  const fullDate = format(createdDate, "MMM d, yyyy 'at' h:mm a");
  const relativeDate = formatDistanceToNow(createdDate, { addSuffix: true });

  return (
    <div className="flex gap-3">
      {comment.user ? (
        <Image
          src={comment.user.avatar_url}
          alt={comment.user.login}
          width={24}
          height={24}
          className="h-6 w-6 rounded-full shrink-0 mt-0.5"
          unoptimized
        />
      ) : (
        <div className="h-6 w-6 rounded-full bg-muted shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {comment.user && (
            <a
              href={`https://github.com/${comment.user.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline"
            >
              {comment.user.login}
            </a>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-default">{relativeDate}</span>
            </TooltipTrigger>
            <TooltipContent>{fullDate}</TooltipContent>
          </Tooltip>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
          <ReactMarkdown>{comment.body}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

interface IssueCommentsProps {
  repositoryId: string;
  issueNumber: number;
  issueUrl?: string;
  showAddComment?: boolean;
}

export function IssueComments({ repositoryId, issueNumber, issueUrl, showAddComment = true }: IssueCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const { data: commentsResponse, isLoading } = useIssueComments(repositoryId, issueNumber);
  const createComment = useCreateIssueComment(repositoryId, issueNumber);

  const comments = commentsResponse?.data ?? [];

  const handleSubmit = () => {
    if (!newComment.trim()) return;

    createComment.mutate(newComment, {
      onSuccess: () => {
        setNewComment("");
        toast.success("Comment posted", {
          description: "Your comment has been added to the issue.",
        });
      },
      onError: (error) => {
        toast.error("Failed to post comment", { description: error.message });
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Comments {!isLoading && `(${comments.length})`}</h3>
        </div>
        {issueUrl && (
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Comment list */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">No comments yet.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}

      {/* New comment form */}
      {showAddComment && (
        <>
          <Separator className="my-4" />
          <div className="space-y-3">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!newComment.trim() || createComment.isPending}
                className="gap-1.5"
              >
                {createComment.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Comment
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
