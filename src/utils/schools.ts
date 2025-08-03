export interface Schools {
  name: string;
  iconName: string;
  className?: string;
}

export const schools: Record<string, Schools> = {
  angular: {
    name: "Salt Lake Community College",
    iconName: "slcc",
  },
  astro: {
    name: "Colorado Technical University",
    iconName: "ctu",
  },
  bootstrap: {
    name: "Lecanto High School",
    iconName: "lhs",
  },
};

export const getSchool = (school: string): Schools => {
  return schools[school] || schools.html;
};