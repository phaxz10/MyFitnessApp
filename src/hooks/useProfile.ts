import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDB } from '../services/db';
import type { UserProfile } from '../types';
import { formatDate } from '../utils/date';

// Query keys
export const profileKeys = {
  all: ['profile'] as const,
};

// Query function - fetches profile from DB
async function fetchProfileFn(): Promise<UserProfile | null> {
  const db = await getDB();
  const result = await db.query('SELECT * FROM user_profile WHERE id = 1');
  const rows = result.rows as UserProfile[];
  if (rows.length === 0) return null;

  const profile = rows[0];
  return {
    ...profile,
    birthdate: profile.birthdate
      ? formatDate(profile.birthdate)
      : profile.birthdate,
  };
}

// Mutation function - creates/upserts profile
async function createProfileFn(
  data: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>,
): Promise<void> {
  const db = await getDB();
  await db.query(
    `INSERT INTO user_profile (id, birthdate, gender, height_cm, activity_level, goal, calorie_target, protein_target_g, carbs_target_g, fat_target_g, ai_provider, ai_model, ai_api_key, ai_proxy_url)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       birthdate = $1, gender = $2, height_cm = $3, activity_level = $4, goal = $5,
       calorie_target = $6, protein_target_g = $7, carbs_target_g = $8,
       fat_target_g = $9, ai_provider = $10, ai_model = $11,
       ai_api_key = $12, ai_proxy_url = $13,
       updated_at = CURRENT_TIMESTAMP`,
    [
      data.birthdate,
      data.gender,
      data.height_cm,
      data.activity_level,
      data.goal,
      data.calorie_target,
      data.protein_target_g,
      data.carbs_target_g,
      data.fat_target_g,
      data.ai_provider,
      data.ai_model,
      data.ai_api_key,
      data.ai_proxy_url,
    ],
  );
}

// Mutation function - updates profile
async function updateProfileFn(data: Partial<UserProfile>): Promise<void> {
  const db = await getDB();
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'id' && key !== 'created_at' && value !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    await db.query(
      `UPDATE user_profile SET ${fields.join(', ')} WHERE id = 1`,
      values,
    );
  }
}

export function useProfile() {
  const queryClient = useQueryClient();

  // READ - useQuery handles fetching automatically
  const {
    data: profile = null,
    isLoading,
    error,
  } = useQuery({
    queryKey: profileKeys.all,
    queryFn: fetchProfileFn,
  });

  // CREATE mutation
  const createMutation = useMutation({
    mutationFn: createProfileFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
  });

  // UPDATE mutation
  const updateMutation = useMutation({
    mutationFn: updateProfileFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all });
    },
  });

  return {
    profile,
    loading: isLoading,
    error: error?.message ?? null,
    createProfile: createMutation.mutateAsync,
    updateProfile: updateMutation.mutateAsync,
  };
}
