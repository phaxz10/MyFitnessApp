import { useState, useCallback } from 'react';
import { getDB } from '../services/db';
import type { UserProfile } from '../types';

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      const result = await db.query('SELECT * FROM user_profile WHERE id = 1');
      const rows = result.rows as UserProfile[];
      setProfile(rows.length > 0 ? rows[0] : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  }, []);

  const createProfile = useCallback(async (data: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>) => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDB();
      await db.query(
        `INSERT INTO user_profile (id, age, gender, height_cm, activity_level, goal, target_rate_kg_per_week, calorie_target, protein_target_g, carbs_target_g, fat_target_g, gemini_api_key)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           age = $1, gender = $2, height_cm = $3, activity_level = $4, goal = $5,
           target_rate_kg_per_week = $6, calorie_target = $7, protein_target_g = $8,
           carbs_target_g = $9, fat_target_g = $10, gemini_api_key = $11,
           updated_at = CURRENT_TIMESTAMP`,
        [
          data.age, data.gender, data.height_cm, data.activity_level, data.goal,
          data.target_rate_kg_per_week, data.calorie_target, data.protein_target_g,
          data.carbs_target_g, data.fat_target_g, data.gemini_api_key
        ]
      );
      await fetchProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchProfile]);

  const updateProfile = useCallback(async (data: Partial<UserProfile>) => {
    setLoading(true);
    setError(null);
    try {
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
          values
        );
        await fetchProfile();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchProfile]);

  return {
    profile,
    loading,
    error,
    fetchProfile,
    createProfile,
    updateProfile,
  };
}
