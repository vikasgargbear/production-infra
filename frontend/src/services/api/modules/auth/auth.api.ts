import {
    getErpAccessToken,
    getErpSessionUser,
    saveErpSession,
} from '../../../auth/erpSessionStorage';
import { User } from '../../../../types/api.types';


// Supabase owns authentication and refresh. This adapter is retained only for
// legacy components that read the current ERP session from local storage.
export const authApi = {
    getCurrentUser: () => getErpSessionUser<User>(),

    updateCurrentUser: (userData: User) => {
        const token = getErpAccessToken();
        if (token) saveErpSession(token, userData);
    },

    isAuthenticated: () => Boolean(getErpAccessToken()),
};
