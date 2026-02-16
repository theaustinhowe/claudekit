export function buildEditContentPrompt(
  editRequest: string,
  currentData: Record<string, unknown>,
  dataType: string,
): string {
  return `You are editing ${dataType} for a software demo video based on a user's request.

Current data:
${JSON.stringify(currentData, null, 2)}

User's edit request: "${editRequest}"

Apply the requested changes to the data. Maintain the same JSON structure but modify the content as requested.

Return the COMPLETE updated data as valid JSON (same structure as the input, with changes applied).
Do not include any explanation, only the JSON.`;
}
