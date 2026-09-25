import 'server-only';
import { cookies } from 'next/headers';
import { LANG_COOKIE, langFrom, type Lang } from './i18n';

export async function getLang(): Promise<Lang> {
  return langFrom((await cookies()).get(LANG_COOKIE)?.value);
}
