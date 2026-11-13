interface SampleShot {
  id: string;
  time: number;
  role: string;
  voiceover: string;
  onScreenText: string;
  stockQueries: string[];
  effectNotes: string;
  animationPrompt: string;
}

interface Sample {
  video: { id: string; title: string };
  shots: SampleShot[];
}

export const BULK_IMPORT_SAMPLE: Sample = {
  video: {
    id: 'explainer-bulk-01',
    title: 'Why You Need Offshore Specialists'
  },
  shots: [
    {
      id: '1.1',
      time: 0,
      role: 'Hook',
      voiceover: 'Running a business is already hard enough.',
      onScreenText: 'Running a business is already hard enough.',
      stockQueries: ['overworked founder desk', 'late night office'],
      effectNotes: 'Word-by-word kinetic slam with a short camera shake.',
      animationPrompt: 'SHOT 1.1 | 3s | OUTPUT: overlay / TEXT: Running a business is already hard enough. / STYLE: word-by-word kinetic text slam with shake'
    },
    {
      id: '1.2',
      time: 3,
      role: 'Pain points',
      voiceover: 'You spend weeks on recruitment, office leases, equipment and admin.',
      onScreenText: 'Recruitment / Office Space / Equipment / Admin',
      stockQueries: ['stack of paperwork', 'empty office desks'],
      effectNotes: 'Strike-through checklist, one red line per item.',
      animationPrompt: 'SHOT 1.2 | 7s | OUTPUT: overlay / TEXT: Recruitment / Office Space / Equipment / Admin / STYLE: strike-checklist pain points sequential strikethrough'
    },
    {
      id: '1.3',
      time: 10,
      role: 'Solution features',
      voiceover: 'With Staff India you get dedicated employees, office infrastructure, recruitment support and flexible hours.',
      onScreenText: 'Dedicated Employees / Office Infrastructure / Recruitment Support / Flexible Working Hours',
      stockQueries: ['modern office team', 'team collaboration'],
      effectNotes: 'Four icon cards pop in sequentially and float gently.',
      animationPrompt: 'SHOT 1.3 | 7s | OUTPUT: overlay / TEXT: Dedicated Employees / Office Infrastructure / Recruitment Support / Flexible Working Hours / STYLE: four icon cards sequential pop-in with floating idle'
    }
  ]
};
