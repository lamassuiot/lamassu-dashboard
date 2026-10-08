
'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as LucideIcons from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';

interface DeviceIconSelectorModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onIconSelected: (iconName: string) => void;
  currentSelectedIconName?: string | null;
  initialIconColor?: string;
  initialBgColor?: string;
  onColorsChange?: (colors: { iconColor: string; bgColor: string }) => void;
}

// Define a type for the structure of our icon list
interface IconDefinition {
  name: keyof typeof LucideIcons; // Ensures names are valid Lucide icon names
  IconComponent: React.ElementType;
  category: string;
}

// Curated list of Lucide icons for IoT devices, grouped by category
const ICON_CATEGORIES: Record<string, (keyof typeof LucideIcons)[]> = {
  'Computing': [
    'Router', 'Smartphone', 'Tablet', 'Laptop', 'Monitor', 'HardDrive', 'Server', 'ServerCog', 'Cpu', 'MemoryStick',
    'CircuitBoard', 'PcCase', 'Keyboard', 'Mouse', 'Usb', 'Terminal', 'Binary', 'Braces', 'Bot', 'Cable',
    'MonitorSmartphone', 'AppWindow', 'Webcam', 'Database', 'Disc3', 'DiscAlbum', 'Save', 'Boxes', 'Container',
  ],
  'Network': [
    'Radio', 'Wifi', 'WifiOff', 'Bluetooth', 'BluetoothConnected', 'Signal', 'Nfc', 'Network', 'Cloud', 'UploadCloud',
    'Globe', 'Link', 'Webhook', 'GitFork', 'Waypoints', 'Workflow', 'Rss', 'Podcast', 'Cast', 'Airplay',
    'SatelliteDish', 'Satellite', 'Antenna', 'RadioTower', 'TowerControl', 'Radar',
  ],
  'Security': [
    'Lock', 'LockKeyhole', 'LockOpen', 'KeyRound', 'Key', 'KeySquare', 'Shield', 'ShieldCheck', 'ShieldAlert',
    'Fingerprint', 'ScanFace', 'ScanEye', 'ScanBarcode', 'Vault', 'Eye', 'Cctv', 'Siren', 'BadgeAlert', 'Badge', 'CreditCard',
  ],
  'Sensors & Energy': [
    'Thermometer', 'ThermometerSun', 'ThermometerSnowflake', 'Gauge', 'Activity', 'HeartPulse', 'Timer', 'Droplet',
    'Droplets', 'Flame', 'Wind', 'Sun', 'Moon', 'Snowflake', 'CloudRain', 'Radiation', 'Magnet', 'Zap', 'PlugZap',
    'BatteryFull', 'BatteryCharging', 'BatteryLow', 'Power', 'CirclePower', 'Plug', 'Unplug', 'Scale', 'Ruler',
  ],
  'Media & Audio': [
    'Camera', 'CameraOff', 'Video', 'VideoOff', 'Mic', 'MicOff', 'Volume2', 'Speaker', 'Headphones', 'Tv',
    'Projector', 'Presentation', 'MonitorSpeaker', 'Image', 'Gamepad2', 'Joystick', 'Printer', 'Watch', 'Glasses',
  ],
  'Home & Appliances': [
    'Home', 'Lightbulb', 'LightbulbOff', 'Lamp', 'LampDesk', 'Flashlight', 'Fan', 'AirVent', 'Heater', 'CookingPot',
    'Microwave', 'Refrigerator', 'WashingMachine', 'Coffee', 'Utensils', 'Sofa', 'BedDouble', 'ShowerHead', 'Blinds',
    'DoorOpen', 'DoorClosed', 'Fence', 'ToggleLeft', 'Bell', 'BellRing',
  ],
  'Transport & Mobility': [
    'Car', 'CarFront', 'Truck', 'Bus', 'Bike', 'TrainFront', 'Train', 'TramFront', 'Plane', 'Ship', 'Sailboat', 'Anchor',
    'Rocket', 'Ambulance', 'Caravan', 'Forklift', 'Tractor', 'Fuel', 'ParkingMeter', 'TrafficCone', 'Signpost',
    'MapPin', 'Map', 'Compass', 'Navigation', 'ArrowUpDown',
  ],
  'Industry & Infrastructure': [
    'Factory', 'Warehouse', 'Building', 'Building2', 'Landmark', 'Hospital', 'School', 'Store', 'Construction', 'Wrench',
    'Hammer', 'Drill', 'Pickaxe', 'Shovel', 'Cog', 'Settings2', 'SlidersHorizontal', 'Recycle', 'Sprout', 'Leaf',
    'Package', 'PackageCheck', 'PackageOpen', 'Box', 'Archive', 'Briefcase', 'Weight',
  ],
  'Health & Science': [
    'Stethoscope', 'Syringe', 'Pill', 'Microscope', 'FlaskConical', 'Atom', 'Orbit', 'Telescope', 'Brain', 'Dna',
  ],
  'Identity & Cards': [
    'IdCard', 'CreditCard', 'WalletCards', 'Contact', 'ContactRound', 'SquareUser', 'SquareUserRound', 'CircleUser',
    'CircleUserRound', 'UserRound', 'UserCheck', 'UserRoundCheck', 'UserCog', 'Users', 'UsersRound', 'BookUser', 'FileUser',
    'FileBadge', 'FileBadge2', 'Badge', 'BadgeCheck', 'BadgeInfo', 'Stamp', 'Signature', 'Fingerprint', 'ScanFace',
    'ScanLine', 'ScanQrCode', 'Nfc', 'KeyRound', 'RectangleEllipsis',
  ],
  'Apps & Software': [
    'AppWindow', 'AppWindowMac', 'LayoutGrid', 'LayoutDashboard', 'LayoutTemplate', 'PanelsTopLeft', 'Grid2x2', 'Grid3x3',
    'Blocks', 'Puzzle', 'Component', 'Layers', 'SquareStack', 'Package2', 'SquareTerminal', 'Code', 'CodeXml', 'SquareCode',
    'FileCode', 'FileJson', 'MessageCircle', 'MessagesSquare', 'Mail', 'Inbox', 'Phone', 'Calendar', 'CalendarDays',
    'Clock', 'AlarmClock', 'Music', 'CirclePlay', 'Folder', 'FileText', 'NotebookPen', 'Calculator', 'ChartPie',
    'ChartLine', 'SquareKanban', 'ListTodo', 'Search', 'Download', 'Settings', 'CloudCog', 'Sparkles', 'BrainCircuit',
    'BotMessageSquare', 'TabletSmartphone',
  ],
  'EV Charging': [
    'PlugZap', 'PlugZap2', 'BatteryCharging', 'BatteryMedium', 'BatteryFull', 'Cable', 'Plug', 'Plug2', 'Unplug', 'Zap',
    'ZapOff', 'Bolt', 'Power', 'Fuel', 'UtilityPole', 'CircleGauge', 'Gauge', 'Car', 'CarFront', 'CarTaxiFront',
    'BusFront', 'Bike', 'Leaf',
  ],
  'Commerce & Misc': [
    'ShoppingBag', 'ShoppingCart', 'Wallet', 'Banknote', 'Coins', 'Ticket', 'Tag', 'QrCode', 'Barcode', 'MessageSquare',
    'User', 'LifeBuoy', 'BarChart2', 'ToyBrick', 'Trophy', 'AlertTriangle', 'Trash2', 'HelpCircle', 'Bug', 'Footprints',
  ],
};

// "All" lists each icon once, even when several categories include it.
const AVAILABLE_ICONS: IconDefinition[] = (() => {
  const seen = new Set<string>();
  const result: IconDefinition[] = [];
  for (const [category, names] of Object.entries(ICON_CATEGORIES)) {
    for (const name of names) {
      const IconComponent = LucideIcons[name] as unknown as React.ElementType | undefined;
      if (!IconComponent || seen.has(name)) continue;
      seen.add(name);
      result.push({ name, IconComponent, category });
    }
  }
  return result;
})();
const ICONS_BY_NAME = new Map(AVAILABLE_ICONS.map(icon => [icon.name as string, icon]));

const ALL_CATEGORIES = 'All';
const CATEGORY_NAMES = [ALL_CATEGORIES, ...Object.keys(ICON_CATEGORIES)];


// Mapping from old react-icon names to new lucide-react names for backward compatibility
const REACT_ICONS_TO_LUCIDE_MAP: { [key: string]: keyof typeof LucideIcons } = {
  // Previous set of mappings
  'FaServer': 'Server',
  'FaLaptop': 'Laptop',
  'FaHdd': 'HardDrive',
  'FaWifi': 'Wifi',
  'FaCloud': 'Cloud',
  'FaDatabase': 'Database',
  'FaKey': 'KeyRound',
  'FaLock': 'Lock',
  'FaCamera': 'Camera',
  'FaVideo': 'Video',
  'FaLightbulb': 'Lightbulb',
  'FaThermometerHalf': 'Thermometer',
  'FaFan': 'Fan',
  'FaBatteryFull': 'BatteryFull',
  'FaCar': 'Car',
  'FaTruck': 'Truck',
  'FaWarehouse': 'Warehouse',
  'FaIndustry': 'Factory',
  'FaCity': 'Building2',
  'FaBroadcastTower': 'TowerControl',
  'FaSatelliteDish': 'SatelliteDish',
  'FaQuestionCircle': 'HelpCircle',
  'FaPlug': 'Plug',
  'FaPrint': 'Printer',
  'FaVolumeUp': 'Volume2',
  'IoPhonePortraitOutline': 'Smartphone',
  'IoHardwareChipOutline': 'Cpu',
  'IoGitNetworkOutline': 'GitFork',
  'IoBluetooth': 'Bluetooth',
  'IoSettingsOutline': 'Settings2',
  'IoPower': 'Power',
  'IoHomeOutline': 'Home',
  'IoBarChartOutline': 'BarChart2',
  
  // New, more specific mappings based on provided list
  "MdDeviceThermostat": 'Thermometer',
  "MdOutlineElectricScooter": 'Bike',
  "MdOutlineElectricRickshaw": 'Bike',
  "MdOutlineElectricalServices": 'PlugZap',
  "MdOutlineElectricMeter": 'Gauge',
  "MdOutlineElectricBike": 'Bike',
  "MdOutlineTrain": 'TrainFront',
  "CgDatabase": 'Database',
  "CgModem": 'Router',
  "CgSmartHomeBoiler": 'Heater',
  "CgSmartHomeCooker": 'CookingPot',
  "CgSmartHomeHeat": 'Heater',
  "CgSmartHomeLight": 'Lightbulb',
  "CgSmartHomeRefrigerator": 'Refrigerator',
  "CgSmartHomeWashMachine": 'WashingMachine',
  "CgSmartphone": 'Smartphone',
  "CgSmartphoneRam": 'MemoryStick',
  "CgSmartphoneShake": 'SmartphoneNfc',
  "CgBatteryFull": 'BatteryFull',
  "GoRadioTower": 'TowerControl',
  "BiSolidCreditCardFront": 'CreditCard',
  "BsSdCard": 'MemoryStick',
  "IoMdCar": 'Car',
  "AiOutlineIdcard": 'IdCard',
  "GiElectric": 'Zap',
  "BsHouse": 'Home',
  "BsHouseGear": 'Settings2',
  "TbCrane": 'Construction',
  "MdOutlineElevator": 'ArrowUpDown',
  'CgSmartphoneChip': 'Cpu',
};


export const getLucideIconByName = (iconName: string | null): React.ElementType => {
    if (!iconName) return LucideIcons.HelpCircle;

    const directMatch = AVAILABLE_ICONS.find(icon => icon.name === iconName);
    if (directMatch) {
        return directMatch.IconComponent;
    }

    const mappedLucideName = REACT_ICONS_TO_LUCIDE_MAP[iconName];
    if (mappedLucideName) {
        const mappedMatch = AVAILABLE_ICONS.find(icon => icon.name === mappedLucideName);
        if (mappedMatch) {
            return mappedMatch.IconComponent;
        }
    }
    
    return LucideIcons.HelpCircle;
};

const ICON_PALETTE = ['#0f67ff', '#334155', '#ef4444', '#22c55e', '#f97316', '#8b5cf6', '#14b8a6', '#ec4899', '#000000', '#4f46e5', '#e11d48', '#65a30d'];
const BG_PALETTE = ['#F0F8FF', '#f1f5f9', '#fee2e2', '#dcfce7', '#ffedd5', '#ede9fe', '#ccfbf1', '#fce7f3', '#e5e7eb', '#e0e7ff', '#fef2f2', '#f7fee7'];

const ColorPalette: React.FC<{
  colors: string[];
  onColorSelect: (color: string) => void;
  title: string;
}> = ({ colors, onColorSelect, title }) => (
  <div>
    <p className="text-xs text-muted-foreground mb-1.5">{title}</p>
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="h-6 w-6 rounded-full border shadow-inner"
          style={{ backgroundColor: color }}
          onClick={() => onColorSelect(color)}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  </div>
);


export const DeviceIconSelectorModal: React.FC<DeviceIconSelectorModalProps> = ({
  isOpen,
  onOpenChange,
  onIconSelected,
  currentSelectedIconName,
  initialIconColor,
  initialBgColor,
  onColorsChange,
}) => {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState(ALL_CATEGORIES);

  const handleSelect = (iconName: string) => {
    onIconSelected(iconName);
  };

  const handleIconColorChange = React.useCallback(
    (newIconColor: string) => {
      if (onColorsChange) {
        onColorsChange({ iconColor: newIconColor, bgColor: initialBgColor || '#e0e0e0' });
      }
    },
    [initialBgColor, onColorsChange]
  );

  const handleBgColorChange = React.useCallback(
    (newBgColor: string) => {
      if (onColorsChange) {
        onColorsChange({ iconColor: initialIconColor || '#888888', bgColor: newBgColor });
      }
    },
    [initialIconColor, onColorsChange]
  );

  const handleInvert = React.useCallback(() => {
    if (onColorsChange) {
      onColorsChange({
        iconColor: initialBgColor || '#e0e0e0',
        bgColor: initialIconColor || '#888888',
      });
    }
  }, [initialIconColor, initialBgColor, onColorsChange]);

  const filteredIcons = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    // A category lists its icons in curated order, not in the order they were first registered.
    const pool = category === ALL_CATEGORIES
      ? AVAILABLE_ICONS
      : ICON_CATEGORIES[category].flatMap(name => ICONS_BY_NAME.get(name) ?? []);
    return pool.filter(
      (icon) =>
        (!query || icon.name.toLowerCase().includes(query))
    );
  }, [search, category]);

  const PreviewIcon = getLucideIconByName(currentSelectedIconName ?? null);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl lg:max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Device Icon</DialogTitle>
          <DialogDescription>Choose an icon that best represents the device type.</DialogDescription>
        </DialogHeader>

        {/* Below lg the whole body scrolls, so its children must not shrink (they would collapse to zero height). */}
        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 lg:flex-row lg:overflow-hidden">
          {/* Icon browser */}
          <div className="flex shrink-0 flex-col gap-3 lg:min-h-0 lg:min-w-0 lg:flex-1 lg:shrink">
            <div className="relative">
              <LucideIcons.Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search icons..."
                className="pl-9"
                aria-label="Search icons"
              />
            </div>
            {/* One swipeable row on small screens; wraps once there is room. */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible md:pb-0">
              {CATEGORY_NAMES.map((name) => (
                <Button
                  key={name}
                  type="button"
                  size="sm"
                  variant={category === name ? 'default' : 'outline'}
                  aria-pressed={category === name}
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={() => setCategory(name)}
                >
                  {name}
                </Button>
              ))}
            </div>
            <div className="h-[40vh] overflow-y-auto rounded-md border sm:h-[45vh] lg:h-auto lg:min-h-0 lg:flex-1">
              {filteredIcons.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No icons match your search.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 p-2 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] sm:p-3">
                  {filteredIcons.map(({ name, IconComponent }) => (
                    <Button
                      key={name}
                      type="button"
                      variant="secondary"
                      className={cn(
                        "flex h-16 flex-col items-center justify-center gap-1 p-1.5 text-center transition-colors sm:h-20 sm:p-2",
                        currentSelectedIconName === name && "ring-2 ring-primary ring-offset-2"
                      )}
                      onClick={() => handleSelect(name)}
                      title={name}
                      aria-pressed={currentSelectedIconName === name}
                      style={{ backgroundColor: initialBgColor }}
                    >
                      <IconComponent className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: initialIconColor }} />
                      <span className="text-[11px] truncate w-full" style={{ color: initialIconColor }}>
                        {name}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Preview + colors */}
          {onColorsChange && (
            <aside className="shrink-0 space-y-5 border-t pt-4 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <div className="flex items-center gap-4">
                <div
                  className="flex size-14 shrink-0 items-center justify-center rounded-lg border sm:size-20"
                  style={{ backgroundColor: initialBgColor }}
                >
                  <PreviewIcon className="size-7 sm:size-10" style={{ color: initialIconColor }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Selected icon</p>
                  <p className="text-sm font-medium truncate">{currentSelectedIconName || 'None'}</p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={handleInvert} className="shrink-0" title="Swap icon and background colors">
                  <LucideIcons.ArrowLeftRight className="mr-2 h-4 w-4" />
                  Invert
                </Button>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="modal-icon-color" className="font-semibold">Icon Color</Label>
                  <ColorPalette colors={ICON_PALETTE} onColorSelect={handleIconColorChange} title="Quick Select" />
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      id="modal-icon-color"
                      type="color"
                      value={initialIconColor}
                      onChange={(e) => handleIconColorChange(e.target.value)}
                      className="w-12 h-10 p-1"
                      aria-label="Advanced icon color picker"
                    />
                    <p className="text-xs text-muted-foreground">Or use the advanced color picker.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="modal-bg-color" className="font-semibold">Background Color</Label>
                  <ColorPalette colors={BG_PALETTE} onColorSelect={handleBgColorChange} title="Quick Select" />
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      id="modal-bg-color"
                      type="color"
                      value={initialBgColor}
                      onChange={(e) => handleBgColorChange(e.target.value)}
                      className="w-12 h-10 p-1"
                      aria-label="Advanced background color picker"
                    />
                    <p className="text-xs text-muted-foreground">Or use the advanced color picker.</p>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
