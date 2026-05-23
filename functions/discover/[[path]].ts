import { spaResponse } from '../spa';

export const onRequest: PagesFunction = async (context) => spaResponse(context);
