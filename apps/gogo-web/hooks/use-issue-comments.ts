import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createIssueComment, fetchIssueComments } from "@/lib/api";

export function useIssueComments(repositoryId: string | undefined, issueNumber: number | null) {
  return useQuery({
    queryKey: ["issue-comments", repositoryId, issueNumber],
    queryFn: () => {
      if (!repositoryId || issueNumber === null) {
        throw new Error("repositoryId and issueNumber are required");
      }
      return fetchIssueComments(repositoryId, issueNumber);
    },
    enabled: !!repositoryId && !!issueNumber,
  });
}

export function useCreateIssueComment(repositoryId: string | undefined, issueNumber: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) => {
      if (!repositoryId || issueNumber === null) {
        throw new Error("repositoryId and issueNumber are required");
      }
      return createIssueComment(repositoryId, issueNumber, body);
    },
    onSuccess: () => {
      // Invalidate the comments query to refetch
      queryClient.invalidateQueries({
        queryKey: ["issue-comments", repositoryId, issueNumber],
      });
    },
  });
}
