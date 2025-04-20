'use client'

interface DiceProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
}

export const Dice = ({ value, size = 'md' }: DiceProps) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  const dotPositions = {
    1: ['center'],
    2: ['top-left', 'bottom-right'],
    3: ['top-left', 'center', 'bottom-right'],
    4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
    6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']
  };

  const getPositionClass = (position: string) => {
    switch (position) {
      case 'top-left': return 'top-[20%] left-[20%]';
      case 'top-right': return 'top-[20%] right-[20%]';
      case 'middle-left': return 'top-[50%] left-[20%] -translate-y-1/2';
      case 'middle-right': return 'top-[50%] right-[20%] -translate-y-1/2';
      case 'bottom-left': return 'bottom-[20%] left-[20%]';
      case 'bottom-right': return 'bottom-[20%] right-[20%]';
      case 'center': return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
      default: return '';
    }
  };

  const dotSize = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3'
  };

  return (
    <div className={`relative ${sizeClasses[size]} bg-white border-2 border-gray-300 rounded-md shadow-md`}>
      {dotPositions[value as keyof typeof dotPositions].map((position, index) => (
        <div 
          key={index} 
          className={`absolute ${dotSize[size]} bg-black rounded-full ${getPositionClass(position)}`}
        />
      ))}
    </div>
  );
};
