import { useMutation } from "@tanstack/react-query";
import { testCommunication, TestRequest, TestResponse } from "@/lib/api";

export function useTestCommunication() {
  return useMutation<TestResponse, Error, TestRequest>({
    mutationFn: testCommunication,
  });
}

