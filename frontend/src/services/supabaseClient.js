import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'your-supabase-url';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// User management functions
export const supabaseUsers = {
  // Get all users with profiles
  async getAll() {
    try {
      // Get all users from auth.users via admin API (requires service role key)
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`
          *,
          auth_users!inner(email, created_at, last_sign_in_at)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map to expected format
      return profiles.map(profile => ({
        id: profile.id,
        username: profile.username,
        email: profile.auth_users.email,
        full_name: profile.full_name,
        role: profile.role,
        is_active: profile.is_active,
        modules: profile.modules || [],
        permissions: profile.permissions || {},
        last_login: profile.auth_users.last_sign_in_at,
        created_at: profile.created_at
      }));
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  // Create new user
  async create(userData) {
    try {
      // Step 1: Create auth user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true
      });

      if (authError) throw authError;

      // Step 2: Create profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authUser.user.id,
          username: userData.username,
          full_name: userData.full_name,
          role: userData.role,
          modules: userData.modules,
          permissions: userData.permissions,
          is_active: true
        }])
        .select()
        .single();

      if (profileError) throw profileError;

      return profile;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  // Update user
  async update(userId, userData) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: userData.full_name,
          role: userData.role,
          modules: userData.modules,
          permissions: userData.permissions,
          is_active: userData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  // Delete user (soft delete)
  async delete(userId) {
    try {
      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },

  // Reset password
  async resetPassword(userId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('auth_users!inner(email)')
        .eq('id', userId)
        .single();

      if (profile) {
        const { error } = await supabase.auth.resetPasswordForEmail(
          profile.auth_users.email,
          { redirectTo: `${window.location.origin}/reset-password` }
        );
        
        if (error) throw error;
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error resetting password:', error);
      throw error;
    }
  }
};

export default supabase;