/**
 * Comprehensive normalization for Vietnamese and international locations.
 */
/**
 * Comprehensive normalization for Vietnamese provinces.
 * Filters out international locations to keep heatmap data relevant.
 */
export const normalizeProvince = (province) => {
  if (!province) return null;
  
  let p = province.trim().toUpperCase();

  // 1. Remove country suffixes
  p = p.replace(/,?\s*(VIETNAM|VIỆT NAM|VN)$/i, '');
  
  // 2. Handle patterns like "..., [Province Name] Province"
  const provinceMatch = p.match(/,\s*([^,]*)\s+(PROVINCE|TỈNH|CITY|THÀNH PHỐ)$/i);
  if (provinceMatch) {
    p = provinceMatch[1].trim();
  } else if (p.includes(',')) {
    const segments = p.split(',').map(s => s.trim());
    p = segments[segments.length - 1];
  }

  // 3. Remove common labels and administrative levels
  const labelsToRemove = [
    /^TP\.\s*/i, /^THÀNH PHỐ\s*/i, /^TỈNH\s*/i,
    /\s+PROVINCE$/i, /\s+CITY$/i, /\s+TỈNH$/i,
    /^QUẬN\s*/i, /^HUYỆN\s*/i, /^XÃ\s*/i, /^PHƯỜNG\s*/i, /^THỊ XÃ\s*/i,
    /^DISTRICT\s*/i, /^WARD\s*/i, /^TOWN\s*/i, /^COMMUNE\s*/i,
    /\s+DISTRICT$/i, /\s+WARD$/i, /\s+TOWN$/i, /\s+COMMUNE$/i
  ];

  labelsToRemove.forEach(regex => {
    p = p.replace(regex, '');
  });

  p = p.trim();
  
  // 4. White-list mapping for top cities/regions
  const hanoiKeywords = ['HA NOI', 'HN', 'HÀ NỘI', 'HANOI', 'THANH XUAN', 'CAU GIAY', 'DONG DA', 'HADONG', 'LE DAI HANH'];
  if (hanoiKeywords.some(key => p.includes(key))) return 'Hà Nội';

  const hcmKeywords = ['HO CHI MINH', 'HCM', 'HỒ CHÍ MINH', 'HOCHIMINH', 'SAIGON', 'BINH THANH', 'THU DUC', 'GO VAP'];
  if (hcmKeywords.some(key => p.includes(key))) return 'Hồ Chí Minh';

  const hueKeywords = ['HUE', 'HUẾ', 'THUA THIEN', 'THỪA THIÊN'];
  if (hueKeywords.some(key => p.includes(key))) return 'Huế';

  const danangKeywords = ['DA NANG', 'ĐÀ NẴNG', 'HOA VANG'];
  if (danangKeywords.some(key => p.includes(key))) return 'Đà Nẵng';

  const canthoKeywords = ['CAN THO', 'CẦN THƠ', 'NINH KIEU'];
  if (canthoKeywords.some(key => p.includes(key))) return 'Cần Thơ';

  // 5. Direct substring matching for provinces
  if (p.includes('QUANG TRI')) return 'Quảng Trị';
  if (p.includes('QUANG NAM')) return 'Quảng Nam';
  if (p.includes('QUANG NGAI')) return 'Quảng Ngãi';
  if (p.includes('QUANG NINH')) return 'Quảng Ninh';
  if (p.includes('QUANG BINH')) return 'Quảng Bình';
  
  if (p.includes('BINH DUONG')) return 'Bình Dương';
  if (p.includes('BINH PHUOC')) return 'Bình Phước';
  if (p.includes('BINH THUAN')) return 'Bình Thuận';
  if (p.includes('BINH DINH')) return 'Bình Định';
  
  if (p.includes('DONG NAI')) return 'Đồng Nai';
  if (p.includes('DONG THAP')) return 'Đồng Tháp';
  
  if (p.includes('BA RIA') || p.includes('VUNG TAU')) return 'Bà Rịa - Vũng Tàu';
  if (p.includes('DAK LAK')) return 'Đắk Lắk';
  if (p.includes('DAK NONG')) return 'Đắk Nông';
  if (p.includes('GIA LAI')) return 'Gia Lai';
  if (p.includes('KON TUM')) return 'Kon Tum';
  if (p.includes('LAM DONG') || p.includes('DA LAT')) return 'Lâm Đồng';
  
  if (p.includes('KHANH HOA') || p.includes('NHA TRANG')) return 'Khánh Hòa';
  if (p.includes('NINH THUAN')) return 'Ninh Thuận';
  if (p.includes('PHU YEN')) return 'Phú Yên';
  
  if (p.includes('LONG AN')) return 'Long An';
  if (p.includes('TIEN GIANG')) return 'Tiền Giang';
  if (p.includes('BEN TRE')) return 'Bến Tre';
  if (p.includes('TRA VINH')) return 'Trà Vinh';
  if (p.includes('VINH LONG')) return 'Vĩnh Long';
  if (p.includes('AN GIANG')) return 'An Giang';
  if (p.includes('KIEN GIANG')) return 'Kiên Giang';
  if (p.includes('SOC TRANG')) return 'Sóc Trăng';
  if (p.includes('BAC LIEU')) return 'Bạc Liêu';
  if (p.includes('CA MAU')) return 'Cà Mau';
  if (p.includes('HAU GIANG')) return 'Hậu Giang';
  
  if (p.includes('HAI DUONG')) return 'Hải Dương';
  if (p.includes('HAI PHONG')) return 'Hải Phòng';
  if (p.includes('BAC NINH')) return 'Bắc Ninh';
  if (p.includes('BAC GIANG')) return 'Bắc Giang';
  if (p.includes('BAC KAN')) return 'Bắc Kạn';
  if (p.includes('CAO BANG')) return 'Cao Bằng';
  if (p.includes('HA GIANG')) return 'Hà Giang';
  if (p.includes('LAO CAI')) return 'Lào Cai';
  if (p.includes('YEN BAI')) return 'Yên Bái';
  if (p.includes('THAI NGUYEN')) return 'Thái Nguyên';
  if (p.includes('LANG SON')) return 'Lạng Sơn';
  if (p.includes('TUYEN QUANG')) return 'Tuyên Quang';
  if (p.includes('PHU THO')) return 'Phú Thọ';
  if (p.includes('VINH PHUC')) return 'Vĩnh Phúc';
  
  if (p.includes('THAI BINH')) return 'Thái Bình';
  if (p.includes('NAM DINH')) return 'Nam Định';
  if (p.includes('HA NAM')) return 'Hà Nam';
  if (p.includes('NINH BINH')) return 'Ninh Bình';
  if (p.includes('HUNG YEN')) return 'Hưng Yên';
  
  if (p.includes('THANH HOA')) return 'Thanh Hóa';
  if (p.includes('NGHE AN')) return 'Nghệ An';
  if (p.includes('HA TINH')) return 'Hà Tĩnh';
  
  if (p.includes('HOA BINH')) return 'Hòa Bình';
  if (p.includes('SON LA')) return 'Sơn La';
  if (p.includes('DIEN BIEN')) return 'Điện Biên';
  if (p.includes('LAI CHAU')) return 'Lai Châu';
  if (p.includes('TAY NINH')) return 'Tây Ninh';

  // 6. Generic cleaning for "OTHER" or junk data
  if (p === 'OTHER' || p === 'UNKNOWN' || p.length < 2) return null;

  // 7. Fallback to title case for any other valid Vietnam string
  return p
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Maps a normalized province name to a region (bac, trung, nam).
 */
export const getRegionFromProvince = (province) => {
  if (!province) return null;

  const normalized = province.trim();

  const bac = [
    'Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Bắc Ninh', 'Bắc Giang', 'Bắc Kạn', 
    'Cao Bằng', 'Hà Giang', 'Lào Cai', 'Yên Bái', 'Thái Nguyên', 'Lạng Sơn', 
    'Tuyên Quang', 'Phú Thọ', 'Vĩnh Phúc', 'Thái Bình', 'Nam Định', 'Hà Nam', 
    'Ninh Bình', 'Hưng Yên', 'Hòa Bình', 'Sơn La', 'Điện Biên', 'Lai Châu',
    'Ha Noi', 'Hai Phong', 'Vinh Phuc', 'Bac Ninh', 'Hung Yen', 'Hai Duong',
    'Ha Nam', 'Nam Dinh', 'Thai Binh', 'Ninh Binh', 'Ha Giang', 'Cao Bang',
    'Bac Kan', 'Tuyen Quang', 'Lao Cai', 'Yen Bai', 'Thai Nguyen', 'Lang Son',
    'Quang Ninh', 'Bac Giang', 'Phu Tho', 'Hoa Binh', 'Son La', 'Dien Bien', 'Lai Chau'
  ];

  const trung = [
    'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Huế', 
    'Đà Nẵng', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 'Phú Yên', 'Khánh Hòa', 
    'Ninh Thuận', 'Bình Thuận', 'Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng',
    'Thanh Hoa', 'Nghe An', 'Ha Tinh', 'Quang Binh', 'Quang Tri', 'Thua Thien Hue',
    'Da Nang', 'Quang Nam', 'Quang Ngai', 'Binh Dinh', 'Phu Yen', 'Khanh Hoa',
    'Ninh Thuan', 'Binh Thuan', 'Kon Tum', 'Gia Lai', 'Dak Lak', 'Dak Nong', 'Lam Dong'
  ];

  const nam = [
    'Hồ Chí Minh', 'Bình Dương', 'Bình Phước', 'Tây Ninh', 'Đồng Nai', 
    'Bà Rịa - Vũng Tàu', 'Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 
    'Vĩnh Long', 'An Giang', 'Đồng Tháp', 'Kiên Giang', 'Cần Thơ', 'Hậu Giang', 
    'Sóc Trăng', 'Bạc Liêu', 'Cà Mau',
    'TP HCM', 'Ho Chi Minh', 'Binh Duong', 'Binh Phuoc', 'Tay Ninh', 'Dong Nai',
    'Ba Ria Vung Tau', 'Long An', 'Tien Giang', 'Ben Tre', 'Tra Vinh', 'Vinh Long',
    'An Giang', 'Dong Thap', 'Kien Giang', 'Can Tho', 'Hau Giang', 'Soc Trang',
    'Bac Lieu', 'Ca Mau'
  ];

  if (bac.some(p => normalized.includes(p) || p.includes(normalized))) return 'bac';
  if (trung.some(p => normalized.includes(p) || p.includes(normalized))) return 'trung';
  if (nam.some(p => normalized.includes(p) || p.includes(normalized))) return 'nam';

  return null;
};

/**
 * Extracts region from team name format: "Nhóm XX [Location]"
 */
export const getRegionFromTeamName = (teamName) => {
  if (!teamName) return null;
  
  const upper = teamName.toUpperCase();
  
  // Specific keywords in team names
  const bacKeywords = ['HN', 'HÀ NỘI', 'HANOI', 'BẮC', 'THÁI NGUYÊN', 'HẢI PHÒNG'];
  const trungKeywords = ['HUẾ', 'HUE', 'ĐÀ NẴNG', 'DANANG', 'QUẢNG NAM', 'TRUNG', 'QUẢNG TRỊ'];
  const namKeywords = ['HCM', 'HỒ CHÍ MINH', 'SAIGON', 'NAM', 'CẦN THƠ', 'BÌNH DƯƠNG'];

  if (bacKeywords.some(key => upper.includes(key))) return 'bac';
  if (trungKeywords.some(key => upper.includes(key))) return 'trung';
  if (namKeywords.some(key => upper.includes(key))) return 'nam';

  // Fallback to general province mapping if team name contains a province name
  return getRegionFromProvince(teamName);
};


