import type { LucideIcon } from 'lucide-react';
import { Briefcase, GraduationCap, HeartHandshake, Luggage, Plane, Sparkles, Ticket } from 'lucide-react';

export type VisaTypeOption = { id: string; label: string; icon: LucideIcon };

export const visaTypeOptions: VisaTypeOption[] = [
  { id: 'tourist', label: 'Tourist Visa', icon: Luggage },
  { id: 'business', label: 'Business Visa', icon: Briefcase },
  { id: 'student', label: 'Student Visa', icon: GraduationCap },
  { id: 'work', label: 'Work Visa', icon: Briefcase },
  { id: 'transit', label: 'Transit Visa', icon: Plane },
  { id: 'family', label: 'Family Visa', icon: HeartHandshake },
  { id: 'digital-nomad', label: 'Digital Nomad Visa', icon: Sparkles },
  { id: 'other', label: 'Other', icon: Ticket },
];
