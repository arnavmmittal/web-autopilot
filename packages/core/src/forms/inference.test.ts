import { describe, it, expect } from 'vitest';

// Test field type inference logic (extracted for testing)
const inferFieldType = (
  type: string,
  name: string,
  id: string,
  label: string,
  placeholder: string
): string => {
  type = type.toLowerCase();
  const combined = `${name} ${id} ${label} ${placeholder}`.toLowerCase();

  if (type === 'email' || combined.includes('email')) return 'email';
  if (type === 'tel' || combined.includes('phone') || combined.includes('tel'))
    return 'phone';
  if (type === 'password' || combined.includes('password')) return 'password';
  if (
    combined.includes('zip') ||
    combined.includes('postal') ||
    combined.includes('postcode')
  )
    return 'postal';
  if (type === 'number') return 'number';
  if (type === 'date' || type === 'datetime-local') return 'date';
  if (type === 'text' || type === '') return 'text';
  return 'unknown';
};

const isFieldRequired = (
  required: boolean,
  ariaRequired: string | null,
  label: string
): boolean => {
  if (required) return true;
  if (ariaRequired === 'true') return true;
  if (label.includes('*') || label.toLowerCase().includes('required')) return true;
  return false;
};

describe('Field Type Inference', () => {
  describe('email detection', () => {
    it('should detect type="email"', () => {
      expect(inferFieldType('email', '', '', '', '')).toBe('email');
    });

    it('should detect email in name', () => {
      expect(inferFieldType('text', 'user_email', '', '', '')).toBe('email');
    });

    it('should detect email in label', () => {
      expect(inferFieldType('text', '', '', 'Email Address', '')).toBe('email');
    });

    it('should detect email in placeholder', () => {
      expect(inferFieldType('text', '', '', '', 'Enter your email')).toBe('email');
    });
  });

  describe('phone detection', () => {
    it('should detect type="tel"', () => {
      expect(inferFieldType('tel', '', '', '', '')).toBe('phone');
    });

    it('should detect phone in name', () => {
      expect(inferFieldType('text', 'phone_number', '', '', '')).toBe('phone');
    });

    it('should detect telephone in label', () => {
      expect(inferFieldType('text', '', '', 'Telephone', '')).toBe('phone');
    });
  });

  describe('password detection', () => {
    it('should detect type="password"', () => {
      expect(inferFieldType('password', '', '', '', '')).toBe('password');
    });

    it('should detect password in name', () => {
      expect(inferFieldType('text', 'password_confirm', '', '', '')).toBe('password');
    });
  });

  describe('postal code detection', () => {
    it('should detect zip in name', () => {
      expect(inferFieldType('text', 'zip_code', '', '', '')).toBe('postal');
    });

    it('should detect postal in label', () => {
      expect(inferFieldType('text', '', '', 'Postal Code', '')).toBe('postal');
    });

    it('should detect postcode in placeholder', () => {
      expect(inferFieldType('text', '', '', '', 'Enter postcode')).toBe('postal');
    });
  });

  describe('other types', () => {
    it('should detect number type', () => {
      expect(inferFieldType('number', '', '', '', '')).toBe('number');
    });

    it('should detect date type', () => {
      expect(inferFieldType('date', '', '', '', '')).toBe('date');
    });

    it('should default to text', () => {
      expect(inferFieldType('text', 'first_name', '', '', '')).toBe('text');
    });
  });
});

describe('Required Field Detection', () => {
  it('should detect required attribute', () => {
    expect(isFieldRequired(true, null, '')).toBe(true);
  });

  it('should detect aria-required', () => {
    expect(isFieldRequired(false, 'true', '')).toBe(true);
  });

  it('should detect asterisk in label', () => {
    expect(isFieldRequired(false, null, 'Name *')).toBe(true);
  });

  it('should detect "required" in label', () => {
    expect(isFieldRequired(false, null, 'Name (required)')).toBe(true);
  });

  it('should return false when not required', () => {
    expect(isFieldRequired(false, null, 'Optional field')).toBe(false);
  });
});
