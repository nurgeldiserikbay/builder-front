import VerifyAction from "./verify-action";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <VerifyAction token={token ?? ""} />;
}
