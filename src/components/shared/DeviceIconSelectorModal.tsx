
'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
}

// Curated list of Lucide icons for IoT devices
const AVAILABLE_ICONS: IconDefinition[] = [
  { name: 'Router', IconComponent: LucideIcons.Router },
  { name: 'Smartphone', IconComponent: LucideIcons.Smartphone },
  { name: 'Tablet', IconComponent: LucideIcons.Tablet },
  { name: 'Laptop', IconComponent: LucideIcons.Laptop },
  { name: 'Monitor', IconComponent: LucideIcons.Monitor },
  { name: 'HardDrive', IconComponent: LucideIcons.HardDrive },
  { name: 'Server', IconComponent: LucideIcons.Server },
  { name: 'Cpu', IconComponent: LucideIcons.Cpu },
  { name: 'MemoryStick', IconComponent: LucideIcons.MemoryStick },
  { name: 'Radio', IconComponent: LucideIcons.Radio },
  { name: 'Wifi', IconComponent: LucideIcons.Wifi },
  { name: 'Bluetooth', IconComponent: LucideIcons.Bluetooth },
  { name: 'Signal', IconComponent: LucideIcons.Signal },
  { name: 'BatteryFull', IconComponent: LucideIcons.BatteryFull },
  { name: 'Thermometer', IconComponent: LucideIcons.Thermometer },
  { name: 'Lightbulb', IconComponent: LucideIcons.Lightbulb },
  { name: 'Fan', IconComponent: LucideIcons.Fan },
  { name: 'Lock', IconComponent: LucideIcons.Lock },
  { name: 'KeyRound', IconComponent: LucideIcons.KeyRound },
  { name: 'Camera', IconComponent: LucideIcons.Camera },
  { name: 'Video', IconComponent: LucideIcons.Video },
  { name: 'Settings2', IconComponent: LucideIcons.Settings2 },
  { name: 'Power', IconComponent: LucideIcons.Power },
  { name: 'Plug', IconComponent: LucideIcons.Plug },
  { name: 'Volume2', IconComponent: LucideIcons.Volume2 },
  { name: 'Printer', IconComponent: LucideIcons.Printer },
  { name: 'Cloud', IconComponent: LucideIcons.Cloud },
  { name: 'Database', IconComponent: LucideIcons.Database },
  { name: 'Disc3', IconComponent: LucideIcons.Disc3 },
  { name: 'CircuitBoard', IconComponent: LucideIcons.CircuitBoard },
  { name: 'Activity', IconComponent: LucideIcons.Activity },
  { name: 'AirVent', IconComponent: LucideIcons.AirVent },
  { name: 'AlertTriangle', IconComponent: LucideIcons.AlertTriangle },
  { name: 'Archive', IconComponent: LucideIcons.Archive },
  { name: 'AppWindow', IconComponent: LucideIcons.AppWindow },
  { name: 'BadgeAlert', IconComponent: LucideIcons.BadgeAlert },
  { name: 'Box', IconComponent: LucideIcons.Box },
  { name: 'Briefcase', IconComponent: LucideIcons.Briefcase },
  { name: 'Cable', IconComponent: LucideIcons.Cable },
  { name: 'Container', IconComponent: LucideIcons.Container },
  { name: 'DiscAlbum', IconComponent: LucideIcons.DiscAlbum },
  { name: 'Gauge', IconComponent: LucideIcons.Gauge },
  { name: 'Globe', IconComponent: LucideIcons.Globe },
  { name: 'Home', IconComponent: LucideIcons.Home },
  { name: 'Image', IconComponent: LucideIcons.Image },
  { name: 'LifeBuoy', IconComponent: LucideIcons.LifeBuoy },
  { name: 'Link', IconComponent: LucideIcons.Link },
  { name: 'MapPin', IconComponent: LucideIcons.MapPin },
  { name: 'MessageSquare', IconComponent: LucideIcons.MessageSquare },
  { name: 'Mic', IconComponent: LucideIcons.Mic },
  { name: 'Navigation', IconComponent: LucideIcons.Navigation },
  { name: 'Network', IconComponent: LucideIcons.Network },
  { name: 'Package', IconComponent: LucideIcons.Package },
  { name: 'QrCode', IconComponent: LucideIcons.QrCode },
  { name: 'SatelliteDish', IconComponent: LucideIcons.SatelliteDish },
  { name: 'Save', IconComponent: LucideIcons.Save },
  { name: 'Shield', IconComponent: LucideIcons.Shield },
  { name: 'ShoppingBag', IconComponent: LucideIcons.ShoppingBag },
  { name: 'Siren', IconComponent: LucideIcons.Siren },
  { name: 'SlidersHorizontal', IconComponent: LucideIcons.SlidersHorizontal },
  { name: 'ToyBrick', IconComponent: LucideIcons.ToyBrick },
  { name: 'Trash2', IconComponent: LucideIcons.Trash2 },
  { name: 'UploadCloud', IconComponent: LucideIcons.UploadCloud },
  { name: 'User', IconComponent: LucideIcons.User },
  { name: 'Wallet', IconComponent: LucideIcons.Wallet },
  { name: 'Webhook', IconComponent: LucideIcons.Webhook },
  { name: 'Zap', IconComponent: LucideIcons.Zap },
  // Adding icons needed for the mapping from react-icons
  { name: 'Car', IconComponent: LucideIcons.Car },
  { name: 'Truck', IconComponent: LucideIcons.Truck },
  { name: 'Warehouse', IconComponent: LucideIcons.Warehouse },
  { name: 'Factory', IconComponent: LucideIcons.Factory },
  { name: 'Building2', IconComponent: LucideIcons.Building2 },
  { name: 'TowerControl', IconComponent: LucideIcons.TowerControl },
  { name: 'HelpCircle', IconComponent: LucideIcons.HelpCircle },
  { name: 'GitFork', IconComponent: LucideIcons.GitFork },
  { name: 'BarChart2', IconComponent: LucideIcons.BarChart2 },
  // Adding icons based on new mapping request
  { name: 'Bike', IconComponent: LucideIcons.Bike },
  { name: 'PlugZap', IconComponent: LucideIcons.PlugZap },
  { name: 'TrainFront', IconComponent: LucideIcons.TrainFront },
  { name: 'Heater', IconComponent: LucideIcons.Heater },
  { name: 'CookingPot', IconComponent: LucideIcons.CookingPot },
  { name: 'WashingMachine', IconComponent: LucideIcons.WashingMachine },
  { name: 'SmartphoneNfc', IconComponent: LucideIcons.SmartphoneNfc },
  { name: 'CreditCard', IconComponent: LucideIcons.CreditCard },
  { name: 'Refrigerator', IconComponent: LucideIcons.Refrigerator },
  { name: 'Badge', IconComponent: LucideIcons.Badge },
  { name: 'Construction', IconComponent: LucideIcons.Construction },
  { name: 'ArrowUpDown', IconComponent: LucideIcons.ArrowUpDown },
];


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
  "AiOutlineIdcard": 'Badge',
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


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Device Icon</DialogTitle>
          <DialogDescription>Choose an icon that best represents the device type.</DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow my-4 overflow-hidden border rounded-md overflow-y-auto">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 p-4">
              {AVAILABLE_ICONS.map(({ name, IconComponent }) => (
                <Button
                  key={name}
                  variant="secondary"
                  className={cn(
                    "flex flex-col items-center justify-center h-24 p-2 space-y-1 text-center transition-colors",
                    currentSelectedIconName === name && "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => handleSelect(name)}
                  title={name}
                  style={{ backgroundColor: initialBgColor }}
                >
                  <IconComponent
                    className="h-8 w-8 mb-1"
                    style={{ color: initialIconColor }}
                  />
                  <span
                    className="text-xs truncate w-full"
                    style={{ color: initialIconColor }}
                  >
                    {name}
                  </span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        {onColorsChange && (
            <div className="pt-4 mt-2 border-t">
                 <div className="flex justify-between items-center mb-3">
                    <p className="text-sm font-medium">Customize Colors</p>
                    <Button
                        type="button"
                        variant="secondary"
                       
                        onClick={handleInvert}
                    >
                        <LucideIcons.ArrowLeftRight className="mr-2 h-4 w-4" />
                        Invert
                    </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Icon Color Section */}
                    <div className="space-y-2">
                        <Label htmlFor="modal-icon-color" className="font-semibold">Icon Color</Label>
                        <ColorPalette
                          colors={ICON_PALETTE}
                          onColorSelect={handleIconColorChange}
                          title="Quick Select"
                        />
                        <div className="flex items-center gap-2 pt-2">
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
                    {/* Background Color Section */}
                    <div className="space-y-2">
                        <Label htmlFor="modal-bg-color" className="font-semibold">Background Color</Label>
                         <ColorPalette
                          colors={BG_PALETTE}
                          onColorSelect={handleBgColorChange}
                          title="Quick Select"
                        />
                         <div className="flex items-center gap-2 pt-2">
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
            </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
