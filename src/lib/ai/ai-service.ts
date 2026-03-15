import { AiProvider, AiGenerateInput, AiGenerateOutput } from "@/types/ai";

let currentProvider: AiProvider | null = null;

export function setAiProvider(provider: AiProvider): void {
  currentProvider = provider;
}

export function getAiProvider(): AiProvider {
  if (!currentProvider) {
    throw new Error(
      "AI provider not configured. Call setAiProvider() first."
    );
  }
  return currentProvider;
}

export async function generateAiContent(
  input: AiGenerateInput
): Promise<AiGenerateOutput> {
  const provider = getAiProvider();
  return provider.generate(input);
}
