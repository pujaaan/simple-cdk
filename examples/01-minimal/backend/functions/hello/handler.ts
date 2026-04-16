interface AppSyncEvent {
  arguments: { name?: string };
}

export const handler = async (event: AppSyncEvent): Promise<string> => {
  const name = event.arguments.name ?? 'world';
  return `hello, ${name}`;
};
