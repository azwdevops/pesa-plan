const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface TestRequest {
  text: string;
}

export interface TestResponse {
  message: string;
}

export async function testCommunication(
  data: TestRequest
): Promise<TestResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/test/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("Failed to communicate with API");
  }

  return response.json();
}

